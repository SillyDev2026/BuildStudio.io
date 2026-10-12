// Optional BuildStudio cloud adapter. No secrets, data, or OAuth credentials ship with the website.
export class CloudClient {
  constructor(url=""){
    this.url=String(url||"").replace(/\/+$/,"");
    this.token=typeof sessionStorage!=="undefined"?sessionStorage.getItem("buildstudio.token")||"":"";
    this.user=null;
  }
  get configured(){return /^https:\/\//i.test(this.url);}
  get signedIn(){return !!this.user;}
  async request(path,options={}){
    if(!this.configured)throw Error("Cloudflare Worker URL not configured");
    const response=await fetch(this.url+path,{...options,headers:{"Content-Type":"application/json",...(this.token?{Authorization:"Bearer "+this.token}:{}),...(options.headers||{})}});
    let body;
    try{body=await response.json();}catch{throw Error("Unexpected API response");}
    if(!response.ok){const error=new Error(body.error||"Cloud request failed");error.status=response.status;throw error;}
    return body;
  }
  async initialize(){
    const match=location.hash.match(/^#auth=([a-f0-9]{64})$/);
    if(match){
      history.replaceState(null,"",location.pathname+location.search);
      if(this.configured){
        const payload=await this.request("/api/auth/exchange",{method:"POST",body:JSON.stringify({ticket:match[1]})});
        this.token=payload.token;this.user=payload.user;
        sessionStorage.setItem("buildstudio.token",this.token);
      }
    }else if(this.configured&&this.token){
      try{this.user=(await this.request("/api/me")).user;}catch{this.token="";sessionStorage.removeItem("buildstudio.token");}
    }
    return this.user;
  }
  login(){if(!this.configured)throw Error("Configure Worker URL first");location.assign(this.url+"/auth/github");}
  async logout(){if(this.token){try{await this.request("/api/logout",{method:"POST"});}catch{}}this.token="";this.user=null;sessionStorage.removeItem("buildstudio.token");}
  async list(){return (await this.request("/api/projects")).projects;}
  async load(id){return (await this.request("/api/projects/"+encodeURIComponent(id))).project;}
  async save(project){
    const body={name:project.name,data:project.data};
    if(project.remoteId && project.remoteUpdatedAt)body.expected_updated_at=project.remoteUpdatedAt;
    const response=await this.request(project.remoteId?"/api/projects/"+encodeURIComponent(project.remoteId):"/api/projects",{
      method:project.remoteId?"PUT":"POST",body:JSON.stringify(body)
    });
    project.remoteId=response.project.id;project.remoteUpdatedAt=response.project.updated_at;return response.project;
  }
  async delete(id){return this.request("/api/projects/"+encodeURIComponent(id),{method:"DELETE"});}
}
