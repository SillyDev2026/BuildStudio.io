--!strict
-- BuildStudio.io v1 • Studio Importer (local plugin)
-- Paste the contents of an exported .json file and click Import into StarterGui.
-- Does not access the internet or execute project-provided code.
local HttpService = game:GetService("HttpService")
local StarterGui = game:GetService("StarterGui")
local Selection = game:GetService("Selection")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local ALLOWED = {Frame = true, CanvasGroup = true, ScrollingFrame = true, TextLabel = true, TextButton = true, TextBox = true, ImageLabel = true, ImageButton = true}
local CONTAINERS = {Frame = true, CanvasGroup = true, ScrollingFrame = true}
local function clamp(value: number, minimum: number, maximum: number): number
    return math.min(maximum, math.max(minimum, value))
end
local function number(value: any, fallback: number): number
    if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then return fallback end
    return value
end
local function rgb(value: any, fallback: Color3): Color3
    if type(value) ~= "string" or not string.match(value, "^#%x%x%x%x%x%x$") then return fallback end
    return Color3.fromRGB(tonumber(string.sub(value, 2, 3), 16) or 0, tonumber(string.sub(value, 4, 5), 16) or 0, tonumber(string.sub(value, 6, 7), 16) or 0)
end
local function import(text: string): (boolean, string)
    if #text > 150000 then return false, "JSON is larger than 150 KB" end
    local ok, parsed = pcall(function() return HttpService:JSONDecode(text) end)
    if not ok or type(parsed) ~= "table" then return false, "Invalid JSON" end
    local data = parsed.data or parsed
    if type(data) ~= "table" or type(data.nodes) ~= "table" or #data.nodes > 500 then return false, "Invalid BuildStudio project" end
    local source = {}
    for _, entry in ipairs(data.nodes) do
        if type(entry) ~= "table" or not ALLOWED[entry.type] or type(entry.id) ~= "string" or source[entry.id] then
            return false, "Unsupported component or duplicate ID"
        end
        source[entry.id] = entry
    end
    for _, entry in ipairs(data.nodes) do
        if entry.parent ~= nil then
            if type(entry.parent) ~= "string" or not source[entry.parent] or not CONTAINERS[source[entry.parent].type] then
                return false, "Invalid component parent"
            end
            local cursor = entry.parent
            local seen = {[entry.id] = true}
            while cursor ~= nil do
                if seen[cursor] then return false, "Cyclic hierarchy" end
                seen[cursor] = true
                cursor = source[cursor].parent
            end
        end
    end
    ChangeHistoryService:SetWaypoint("Before BuildStudio import")
    local old = StarterGui:FindFirstChild("BuildStudioGui")
    if old then old:Destroy() end
    local gui = Instance.new("ScreenGui")
    gui.Name = "BuildStudioGui"
    gui.IgnoreGuiInset = true
    gui.ResetOnSpawn = false
    gui.Parent = StarterGui
    local created = {}
    local function make(entry: any): GuiObject
        if created[entry.id] then return created[entry.id] end
        local parent: Instance = gui
        if entry.parent then parent = make(source[entry.parent]) end
        local item = Instance.new(entry.type) :: GuiObject
        item.Name = tostring(entry.name or entry.type):sub(1, 120)
        item.Position = UDim2.fromScale(clamp(number(entry.x, 0.15), -1, 1), clamp(number(entry.y, 0.18), -1, 1))
        item.Size = UDim2.fromScale(clamp(number(entry.w, 0.3), 0.015, 1.5), clamp(number(entry.h, 0.12), 0.015, 1.5))
        item.AnchorPoint = Vector2.new(clamp(number(entry.anchorX, 0), 0, 1), clamp(number(entry.anchorY, 0), 0, 1))
        item.Rotation = clamp(number(entry.rotation, 0), -360, 360)
        item.ZIndex = math.floor(clamp(number(entry.zIndex, 1), 1, 100))
        item.BackgroundColor3 = rgb(entry.color, Color3.fromRGB(31, 52, 71))
        item.BackgroundTransparency = clamp(number(entry.opacity, 0), 0, 100) / 100
        item.BorderColor3 = rgb(entry.borderColor, Color3.new(1, 1, 1))
        item.BorderSizePixel = math.floor(clamp(number(entry.border, 0), 0, 24))
        item.Visible = entry.visible ~= false
        item.Parent = parent
        if CONTAINERS[entry.type] then item.ClipsDescendants = entry.clip == true end
        if entry.type == "ScrollingFrame" then
            local scroll = item :: ScrollingFrame
            scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
            scroll.ScrollBarThickness = 6
        end
        if string.sub(entry.type, 1, 4) == "Text" then
            local obj = item :: TextLabel
            obj.Text = tostring(entry.text or ""):sub(1, 5000)
            obj.TextColor3 = rgb(entry.textColor, Color3.new(1, 1, 1))
            obj.TextSize = math.floor(clamp(number(entry.fontSize, 18), 6, 96))
            obj.TextScaled = entry.textScaled ~= false
            obj.TextWrapped = true
            if type(entry.font) == "string" then pcall(function() obj.Font = Enum.Font[entry.font] end) end
            if entry.textAlign == "Left" then obj.TextXAlignment = Enum.TextXAlignment.Left
            elseif entry.textAlign == "Right" then obj.TextXAlignment = Enum.TextXAlignment.Right
            else obj.TextXAlignment = Enum.TextXAlignment.Center end
            if entry.type == "TextBox" then (item :: TextBox).PlaceholderText = tostring(entry.placeholder or "Enter text") end
        end
        if string.sub(entry.type, 1, 5) == "Image" then
            local digits = string.match(tostring(entry.image or ""), "%d+")
            (item :: ImageLabel).Image = digits and ("rbxassetid://" .. digits) or ""
        end
        local radius = clamp(number(entry.radius, 8), 0, 100)
        if radius > 0 then
            local corner = Instance.new("UICorner")
            corner.CornerRadius = UDim.new(0, radius)
            corner.Parent = item
        end
        local thickness = clamp(number(entry.stroke, 0), 0, 24)
        if thickness > 0 then
            local stroke = Instance.new("UIStroke")
            stroke.Thickness = thickness
            stroke.Color = rgb(entry.strokeColor, Color3.new(1, 1, 1))
            stroke.Parent = item
        end
        local aspect = clamp(number(entry.aspect, 0), 0, 10)
        if aspect > 0 then
            local constraint = Instance.new("UIAspectRatioConstraint")
            constraint.AspectRatio = math.max(0.1, aspect)
            constraint.Parent = item
        end
        local padding = clamp(number(entry.padding, 0), 0, 0.4)
        if CONTAINERS[entry.type] and padding > 0 then
            local pad = Instance.new("UIPadding")
            pad.PaddingTop = UDim.new(padding, 0)
            pad.PaddingBottom = UDim.new(padding, 0)
            pad.PaddingLeft = UDim.new(padding, 0)
            pad.PaddingRight = UDim.new(padding, 0)
            pad.Parent = item
        end
        if CONTAINERS[entry.type] and entry.layout ~= nil and entry.layout ~= "none" then
            if entry.layout == "grid" then
                local layout = Instance.new("UIGridLayout")
                layout.CellSize = UDim2.fromScale(0.3, 0.22)
                layout.CellPadding = UDim2.fromScale(0.025, 0.025)
                layout.Parent = item
            elseif entry.layout == "vertical" or entry.layout == "horizontal" then
                local layout = Instance.new("UIListLayout")
                layout.FillDirection = if entry.layout == "horizontal" then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical
                layout.Parent = item
            end
        end
        created[entry.id] = item
        return item
    end
    for _, entry in ipairs(data.nodes) do make(entry) end
    Selection:Set({gui})
    ChangeHistoryService:SetWaypoint("BuildStudio import")
    return true, "Imported " .. tostring(#data.nodes) .. " components into StarterGui"
end

local toolbar = plugin:CreateToolbar("BuildStudio.io")
local button = toolbar:CreateButton("BuildStudioImporter", "Import a BuildStudio.io JSON design", "")
button.ClickableWhenViewportHidden = true
local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 420, 450, 300, 270)
local widget = plugin:CreateDockWidgetPluginGuiAsync("BuildStudioImporterV1", widgetInfo)
widget.Title = "BuildStudio.io · JSON Import"
local body = Instance.new("Frame")
body.Size = UDim2.fromScale(1, 1)
body.BackgroundColor3 = Color3.fromRGB(19, 31, 47)
body.Parent = widget
local input = Instance.new("TextBox")
input.Position = UDim2.fromScale(0.04, 0.04)
input.Size = UDim2.fromScale(0.92, 0.72)
input.Text = ""
input.PlaceholderText = "Paste exported BuildStudio JSON here..."
input.MultiLine = true
input.ClearTextOnFocus = false
input.TextWrapped = false
input.TextXAlignment = Enum.TextXAlignment.Left
input.TextYAlignment = Enum.TextYAlignment.Top
input.Font = Enum.Font.Code
input.TextSize = 13
input.TextColor3 = Color3.fromRGB(221, 244, 255)
input.BackgroundColor3 = Color3.fromRGB(9, 21, 34)
input.Parent = body
local importButton = Instance.new("TextButton")
importButton.Position = UDim2.fromScale(0.04, 0.79)
importButton.Size = UDim2.fromScale(0.92, 0.09)
importButton.Text = "Import into StarterGui"
importButton.Font = Enum.Font.GothamBold
importButton.TextSize = 15
importButton.TextColor3 = Color3.fromRGB(5, 32, 25)
importButton.BackgroundColor3 = Color3.fromRGB(52, 216, 167)
importButton.Parent = body
local status = Instance.new("TextLabel")
status.Position = UDim2.fromScale(0.04, 0.89)
status.Size = UDim2.fromScale(0.92, 0.09)
status.Text = "Local import only · no network connection"
status.TextScaled = true
status.TextColor3 = Color3.fromRGB(165, 188, 207)
status.BackgroundTransparency = 1
status.Parent = body
button.Click:Connect(function()
    widget.Enabled = not widget.Enabled
end)
importButton.MouseButton1Click:Connect(function()
    local ok, success, message = pcall(import, input.Text)
    if not ok then
        status.Text = "Import failed: " .. tostring(success)
    else
        status.Text = message
        status.TextColor3 = success and Color3.fromRGB(112, 250, 194) or Color3.fromRGB(255, 153, 160)
    end
end)
