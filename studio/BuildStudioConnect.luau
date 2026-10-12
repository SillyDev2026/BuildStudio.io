-- BuildStudio Studio Connect v1.1 • Local-only, paired, bidirectional synchronization.
-- Install as a Local Plugin. Does not use Cloudflare or external web services.
local HttpService = game:GetService("HttpService")
local StarterGui = game:GetService("StarterGui")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local ENDPOINT = "http://127.0.0.1:38471"
local POLL_SECONDS = 3
local ALLOWED = {Frame=true,CanvasGroup=true,ScrollingFrame=true,TextLabel=true,TextButton=true,TextBox=true,ImageLabel=true,ImageButton=true}
local CONTAINERS = {Frame=true,CanvasGroup=true,ScrollingFrame=true}
local token = plugin:GetSetting("ConnectTokenV11")
local revision = -1
local activeProject = nil
local lastSnapshot = plugin:GetSetting("LastSnapshotV11")
local conflict = false
local running = true

local function clamp(n,low,high)
    return math.min(high, math.max(low,n))
end
local function safeNumber(n,fallback)
    if type(n) ~= "number" or n ~= n or n == math.huge or n == -math.huge then return fallback end
    return n
end
local function colorHex(c)
    return string.format("#%02x%02x%02x",math.round(c.R*255),math.round(c.G*255),math.round(c.B*255))
end
local function fromHex(c)
    if type(c) ~= "string" or not string.match(c,"^#%x%x%x%x%x%x$") then return Color3.new(1,1,1) end
    return Color3.fromRGB(tonumber(string.sub(c,2,3),16) or 255,tonumber(string.sub(c,4,5),16) or 255,tonumber(string.sub(c,6,7),16) or 255)
end
local function request(method,path,data,needsToken)
    local headers = {["Content-Type"]="application/json"}
    if needsToken ~= false and type(token) == "string" then headers.Authorization = "Bearer " .. token end
    local success,response = pcall(function()
        return HttpService:RequestAsync({Url=ENDPOINT..path,Method=method,Headers=headers,Body=data and HttpService:JSONEncode(data) or nil})
    end)
    if not success then return nil,"Bridge offline: "..tostring(response),0 end
    local parsed = nil
    local parsedOK = pcall(function() parsed = HttpService:JSONDecode(response.Body) end)
    if not parsedOK then return nil,"Invalid bridge response",response.StatusCode end
    if not response.Success then return nil,tostring(parsed.error or "Bridge request failed"),response.StatusCode end
    return parsed,nil,response.StatusCode
end
local function guiRoot()
    local gui = StarterGui:FindFirstChild("BuildStudioGui")
    if gui and gui:IsA("ScreenGui") then return gui end
    return nil
end
local function contentHash(project)
    local value = HttpService:JSONEncode(project and project.data and project.data.nodes or {})
    local hash = 5381
    for index=1,#value do hash = (hash*33 + string.byte(value,index)) % 4294967296 end
    return tostring(#value) .. ":" .. tostring(hash)
end
local function exportGui(previous)
    local root = guiRoot()
    if not root then return nil end
    local nodes = {}
    local previousNodes = {}
    if previous and previous.data and previous.data.nodes then
        for _,node in ipairs(previous.data.nodes) do previousNodes[node.id] = node end
    end
    local function readNode(object,parentId)
        if not object:IsA("GuiObject") or not ALLOWED[object.ClassName] then return end
        local id = object:GetAttribute("BuildStudioNodeId")
        if type(id) ~= "string" or #id==0 then
            id = HttpService:GenerateGUID(false)
            object:SetAttribute("BuildStudioNodeId",id)
        end
        local old = previousNodes[id] or {}
        local n = {}
        for key,value in pairs(old) do n[key] = value end
        n.id = id
        n.type = object.ClassName
        n.name = object.Name
        n.parent = parentId
        local parentWidth,parentHeight = 0,0
        if object.Parent:IsA("GuiObject") then
            parentWidth = object.Parent.AbsoluteSize.X
            parentHeight = object.Parent.AbsoluteSize.Y
        elseif workspace.CurrentCamera then
            parentWidth = workspace.CurrentCamera.ViewportSize.X
            parentHeight = workspace.CurrentCamera.ViewportSize.Y
        end
        n.x = clamp(object.Position.X.Scale + (parentWidth>0 and object.Position.X.Offset/parentWidth or 0),-1,1)
        n.y = clamp(object.Position.Y.Scale + (parentHeight>0 and object.Position.Y.Offset/parentHeight or 0),-1,1)
        n.w = clamp(object.Size.X.Scale + (parentWidth>0 and object.Size.X.Offset/parentWidth or 0),.015,1.5)
        n.h = clamp(object.Size.Y.Scale + (parentHeight>0 and object.Size.Y.Offset/parentHeight or 0),.015,1.5)
        n.anchorX = object.AnchorPoint.X
        n.anchorY = object.AnchorPoint.Y
        n.rotation = object.Rotation
        n.zIndex = object.ZIndex
        n.visible = object.Visible
        n.color = colorHex(object.BackgroundColor3)
        n.borderColor = colorHex(object.BorderColor3)
        n.border = object.BorderSizePixel
        n.opacity = math.round(object.BackgroundTransparency*100)
        local corner = object:FindFirstChildOfClass("UICorner")
        n.radius = corner and math.max(0,corner.CornerRadius.Offset) or 0
        local stroke = object:FindFirstChildOfClass("UIStroke")
        n.stroke = stroke and stroke.Thickness or 0
        n.strokeColor = stroke and colorHex(stroke.Color) or (old.strokeColor or "#ffffff")
        local aspect = object:FindFirstChildOfClass("UIAspectRatioConstraint")
        n.aspect = aspect and aspect.AspectRatio or 0
        local padding = object:FindFirstChildOfClass("UIPadding")
        n.padding = padding and padding.PaddingTop.Scale or 0
        n.layout = "none"
        local list = object:FindFirstChildOfClass("UIListLayout")
        if list then n.layout = list.FillDirection==Enum.FillDirection.Horizontal and "horizontal" or "vertical" end
        if object:FindFirstChildOfClass("UIGridLayout") then n.layout = "grid" end
        n.clip = object.ClipsDescendants
        n.text = ""
        n.image = ""
        if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
            n.text = object.Text
            n.textColor = colorHex(object.TextColor3)
            n.textScaled = object.TextScaled
            n.fontSize = object.TextSize
            n.font = object.Font.Name
            n.textAlign = object.TextXAlignment.Name
            if object:IsA("TextBox") then n.placeholder = object.PlaceholderText end
        end
        if object:IsA("ImageLabel") or object:IsA("ImageButton") then
            n.image = string.match(object.Image,"%d+") or ""
        end
        table.insert(nodes,n)
        for _,child in ipairs(object:GetChildren()) do
            if child:IsA("GuiObject") and ALLOWED[child.ClassName] then readNode(child,id) end
        end
    end
    for _,child in ipairs(root:GetChildren()) do
        if child:IsA("GuiObject") and ALLOWED[child.ClassName] then readNode(child,nil) end
    end
    local name = root:GetAttribute("BuildStudioProjectName") or (previous and previous.name) or "Studio UI"
    local projectId = root:GetAttribute("BuildStudioProjectId") or (previous and previous.id) or HttpService:GenerateGUID(false)
    return {id=projectId,name=name,data={version=1,name=name,nodes=nodes}}
end
local function applyProject(project)
    if type(project)~="table" or type(project.data)~="table" or type(project.data.nodes)~="table" or #project.data.nodes>500 then
        return false,"Invalid project from browser"
    end
    local indexed = {}
    for _,n in ipairs(project.data.nodes) do
        if not ALLOWED[n.type] or type(n.id)~="string" or indexed[n.id] then return false,"Unsupported UI or duplicate IDs" end
        indexed[n.id]=n
    end
    for _,n in ipairs(project.data.nodes) do
        local cursor=n.parent
        local seen={[n.id]=true}
        while cursor do
            if seen[cursor] or not indexed[cursor] or not CONTAINERS[indexed[cursor].type] then return false,"Invalid parent cycle" end
            seen[cursor]=true
            cursor=indexed[cursor].parent
        end
    end
    local old=guiRoot()
    ChangeHistoryService:SetWaypoint("Before BuildStudio sync")
    local root=Instance.new("ScreenGui")
    root.Name="BuildStudioGui"
    root.ResetOnSpawn=false
    root.IgnoreGuiInset=true
    root:SetAttribute("BuildStudioProjectId",project.id)
    root:SetAttribute("BuildStudioProjectName",project.name)
    local cache = {}
    local function create(n)
        if cache[n.id] then return cache[n.id] end
        local parent=root
        if n.parent then parent=create(indexed[n.parent]) end
        local object=Instance.new(n.type)
        object.Name=tostring(n.name or n.type):sub(1,120)
        object.Position=UDim2.fromScale(safeNumber(n.x,.15),safeNumber(n.y,.18))
        object.Size=UDim2.fromScale(safeNumber(n.w,.3),safeNumber(n.h,.12))
        object.AnchorPoint=Vector2.new(clamp(safeNumber(n.anchorX,0),0,1),clamp(safeNumber(n.anchorY,0),0,1))
        object.Rotation=clamp(safeNumber(n.rotation,0),-360,360)
        object.ZIndex=math.round(clamp(safeNumber(n.zIndex,1),1,100))
        object.BackgroundColor3=fromHex(n.color)
        object.BackgroundTransparency=clamp(safeNumber(n.opacity,0)/100,0,1)
        object.BorderColor3=fromHex(n.borderColor)
        object.BorderSizePixel=math.round(clamp(safeNumber(n.border,0),0,24))
        object.Visible=n.visible~=false
        object.ClipsDescendants=n.clip==true
        object:SetAttribute("BuildStudioNodeId",n.id)
        if object:IsA("TextLabel") or object:IsA("TextButton") or object:IsA("TextBox") then
            object.Text=tostring(n.text or "")
            object.TextColor3=fromHex(n.textColor)
            object.TextSize=math.round(clamp(safeNumber(n.fontSize,18),6,96))
            object.TextScaled=n.textScaled~=false
            object.TextWrapped=true
            if type(n.font)=="string" then pcall(function() object.Font=Enum.Font[n.font] end) end
            if n.textAlign=="Left" then object.TextXAlignment=Enum.TextXAlignment.Left
            elseif n.textAlign=="Right" then object.TextXAlignment=Enum.TextXAlignment.Right
            else object.TextXAlignment=Enum.TextXAlignment.Center end
            if object:IsA("TextBox") then object.PlaceholderText=tostring(n.placeholder or "Enter text") end
        elseif object:IsA("ImageLabel") or object:IsA("ImageButton") then
            local digits=string.match(tostring(n.image or ""),"%d+")
            object.Image=digits and "rbxassetid://"..digits or ""
        end
        local radius=clamp(safeNumber(n.radius,0),0,100)
        if radius>0 then
            local corner=Instance.new("UICorner")
            corner.CornerRadius=UDim.new(0,radius)
            corner.Parent=object
        end
        if safeNumber(n.stroke,0)>0 then
            local stroke=Instance.new("UIStroke")
            stroke.Thickness=clamp(n.stroke,0,24)
            stroke.Color=fromHex(n.strokeColor)
            stroke.Parent=object
        end
        if safeNumber(n.aspect,0)>0 then
            local aspect=Instance.new("UIAspectRatioConstraint")
            aspect.AspectRatio=clamp(n.aspect,.1,10)
            aspect.Parent=object
        end
        if CONTAINERS[n.type] then
            if safeNumber(n.padding,0)>0 then
                local padding=Instance.new("UIPadding")
                local value=UDim.new(clamp(n.padding,0,.4),0)
                padding.PaddingTop=value
                padding.PaddingBottom=value
                padding.PaddingLeft=value
                padding.PaddingRight=value
                padding.Parent=object
            end
            if n.layout=="grid" then
                local layout=Instance.new("UIGridLayout")
                layout.CellSize=UDim2.fromScale(.3,.22)
                layout.CellPadding=UDim2.fromScale(.025,.025)
                layout.Parent=object
            elseif n.layout=="horizontal" or n.layout=="vertical" then
                local layout=Instance.new("UIListLayout")
                layout.FillDirection=n.layout=="horizontal" and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical
                layout.Parent=object
            end
        end
        if object:IsA("ScrollingFrame") then
            object.AutomaticCanvasSize=Enum.AutomaticSize.Y
            object.ScrollBarThickness=6
        end
        object.Parent=parent
        cache[n.id]=object
        return object
    end
    local ok,message=pcall(function()
        for _,n in ipairs(project.data.nodes) do create(n) end
    end)
    if not ok then root:Destroy() return false,tostring(message) end
    if old then old:Destroy() end
    root.Parent=StarterGui
    Selection:Set({root})
    ChangeHistoryService:SetWaypoint("BuildStudio sync")
    return true,nil
end

local toolbar=plugin:CreateToolbar("BuildStudio.io")
local button=toolbar:CreateButton("StudioConnect","Open BuildStudio Studio Connect","")
button.ClickableWhenViewportHidden=true
local widget=plugin:CreateDockWidgetPluginGuiAsync("BuildStudioStudioConnectV11",DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float,false,false,440,390,340,320))
widget.Title="BuildStudio Studio Connect v1.1"
local body=Instance.new("Frame")
body.BackgroundColor3=Color3.fromRGB(18,30,45)
body.Size=UDim2.fromScale(1,1)
body.Parent=widget
local function label(text,y,h,size)
    local node=Instance.new("TextLabel")
    node.BackgroundTransparency=1
    node.TextColor3=Color3.fromRGB(205,226,242)
    node.Font=Enum.Font.Gotham
    node.TextSize=size or 13
    node.TextXAlignment=Enum.TextXAlignment.Left
    node.TextWrapped=true
    node.Text=text
    node.Position=UDim2.fromScale(.05,y)
    node.Size=UDim2.fromScale(.9,h)
    node.Parent=body
    return node
end
label("Local Node.js bridge: 127.0.0.1:38471",.04,.13,14)
local codeInput=Instance.new("TextBox")
codeInput.Position=UDim2.fromScale(.05,.2)
codeInput.Size=UDim2.fromScale(.9,.16)
codeInput.PlaceholderText="Pairing code from Node terminal"
codeInput.Text=""
codeInput.Font=Enum.Font.Code
codeInput.TextSize=16
codeInput.BackgroundColor3=Color3.fromRGB(9,21,34)
codeInput.TextColor3=Color3.fromRGB(243,251,255)
codeInput.ClearTextOnFocus=false
codeInput.Parent=body
local function action(title,x,width)
    local node=Instance.new("TextButton")
    node.Position=UDim2.fromScale(x,.42)
    node.Size=UDim2.fromScale(width,.16)
    node.Text=title
    node.Font=Enum.Font.GothamBold
    node.TextSize=12
    node.BackgroundColor3=Color3.fromRGB(28,126,109)
    node.TextColor3=Color3.new(1,1,1)
    node.Parent=body
    return node
end
local connectButton=action("Pair",.05,.29)
local retryButton=action("Sync now",.355,.29)
local forgetButton=action("Disconnect",.66,.29)
forgetButton.BackgroundColor3=Color3.fromRGB(119,48,66)
local websiteButton=Instance.new("TextButton")
websiteButton.Position=UDim2.fromScale(.05,.61)
websiteButton.Size=UDim2.fromScale(.42,.12)
websiteButton.Text="Use Website"
websiteButton.TextSize=13
websiteButton.Font=Enum.Font.GothamBold
websiteButton.BackgroundColor3=Color3.fromRGB(32,100,91)
websiteButton.TextColor3=Color3.new(1,1,1)
websiteButton.Parent=body
local studioButton=websiteButton:Clone()
studioButton.Position=UDim2.fromScale(.53,.61)
studioButton.Text="Use Studio"
studioButton.Parent=body
local status=label(token and "Reconnecting to local bridge..." or "Not paired • enter one-time code",.76,.12,13)
local detail=label("Local PC bridge only. Two-way sync every 3 seconds; conflicts require your choice.",.89,.09,11)
local function setStatus(message) status.Text=message end
local function pair()
    local code=string.upper(string.gsub(codeInput.Text,"[%s%-]",""))
    local value,err=request("POST","/v1/pair",{code=code,role="studio",device_name="Roblox Studio"},false)
    if not value then setStatus(err) return end
    token=value.token
    plugin:SetSetting("ConnectTokenV11",token)
    revision=-1
    activeProject=nil
    lastSnapshot=nil
    plugin:SetSetting("LastSnapshotV11",nil)
    conflict=false
    codeInput.Text=""
    setStatus("Paired • syncing automatically")
end
connectButton.MouseButton1Click:Connect(pair)
forgetButton.MouseButton1Click:Connect(function()
    if token then request("POST","/v1/disconnect",{},true) end
    token=nil
    plugin:SetSetting("ConnectTokenV11",nil)
    revision=-1
    activeProject=nil
    conflict=false
    setStatus("Disconnected")
end)
local function tickSync()
    if not token or conflict then return end
    local remote,err,statusCode=request("GET","/v1/state",nil,true)
    if not remote then
        if statusCode==401 then
            token=nil
            plugin:SetSetting("ConnectTokenV11",nil)
        end
        setStatus(err)
        return
    end
    if not remote.project then
        setStatus("Connected • open a project in BuildStudio website")
        return
    end
    local localProject=exportGui(activeProject or remote.project)
    local changed=lastSnapshot~=nil and localProject~=nil and contentHash(localProject)~=lastSnapshot
    if revision==-1 then
        -- On restart, never silently overwrite Studio edits made while offline.
        if localProject and (not lastSnapshot or contentHash(localProject)~=lastSnapshot) then
            conflict=true
            setStatus("Different Studio/website versions. Choose Use Studio or Use Website.")
            return
        end
        -- On restart, a clean Studio snapshot may safely pull newer website changes.
        local ok,why=applyProject(remote.project)
        if not ok then setStatus("Import failed: "..tostring(why)) return end
        revision=remote.revision
        activeProject=remote.project
        lastSnapshot=contentHash(exportGui(activeProject))
        plugin:SetSetting("LastSnapshotV11",lastSnapshot)
        setStatus("Connected • "..remote.project.name.." • rev "..revision)
        return
    end
    if remote.revision~=revision then
        if changed then
            conflict=true
            setStatus("CONFLICT: Studio and website both changed. Export backup, then reconnect.")
            return
        end
        local ok,why=applyProject(remote.project)
        if not ok then setStatus("Import failed: "..tostring(why)) return end
        revision=remote.revision
        activeProject=remote.project
        lastSnapshot=contentHash(exportGui(activeProject))
        plugin:SetSetting("LastSnapshotV11",lastSnapshot)
        setStatus("Updated from website • rev "..revision)
        return
    end
    if changed then
        local result,saveError,code=request("PUT","/v1/state",{revision=revision,project=localProject},true)
        if result then
            revision=result.revision
            activeProject=localProject
            lastSnapshot=contentHash(localProject)
            plugin:SetSetting("LastSnapshotV11",lastSnapshot)
            setStatus("Studio → website synced • rev "..revision)
        elseif code==409 then
            conflict=true
            setStatus("CONFLICT: "..saveError)
        else
            setStatus("Sync retrying: "..saveError)
        end
    else
        setStatus("Connected • "..remote.project.name.." • rev "..revision)
    end
end
websiteButton.MouseButton1Click:Connect(function()
    if not token then setStatus("Pair the plugin first") return end
    local r,err=request("GET","/v1/state",nil,true)
    if not r or not r.project then setStatus(err or "No website design yet") return end
    local ok,why=applyProject(r.project)
    if not ok then setStatus("Import failed: "..tostring(why)) return end
    revision=r.revision
    activeProject=r.project
    lastSnapshot=contentHash(exportGui(activeProject))
    plugin:SetSetting("LastSnapshotV11",lastSnapshot)
    conflict=false
    setStatus("Used website version • rev "..revision)
end)
studioButton.MouseButton1Click:Connect(function()
    if not token then setStatus("Pair the plugin first") return end
    local r,err=request("GET","/v1/state",nil,true)
    if not r then setStatus(err) return end
    local localProject=exportGui(activeProject or r.project)
    if not localProject then setStatus("No BuildStudioGui in StarterGui") return end
    local saved,why=request("PUT","/v1/state",{revision=r.revision,project=localProject},true)
    if not saved then setStatus("Publish failed: "..tostring(why)) return end
    activeProject=localProject
    revision=saved.revision
    lastSnapshot=contentHash(localProject)
    plugin:SetSetting("LastSnapshotV11",lastSnapshot)
    conflict=false
    setStatus("Used Studio version • rev "..revision)
end)
retryButton.MouseButton1Click:Connect(function()
    conflict=false
    if conflict then setStatus("Choose Use Website or Use Studio to resolve conflict") return end
    local ok,err=pcall(tickSync)
    if not ok then setStatus("Sync error: "..tostring(err)) end
end)
button.Click:Connect(function()
    widget.Enabled=not widget.Enabled
end)
task.spawn(function()
    while running do
        if token and not conflict then
            local ok,err=pcall(tickSync)
            if not ok then setStatus("Sync error: "..tostring(err)) end
        end
        task.wait(POLL_SECONDS)
    end
end)
plugin.Unloading:Connect(function()
    running=false
end)
