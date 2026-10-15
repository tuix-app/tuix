/* ES5 loader: no requests until activation; queues calls while the core loads. */
(function(w,d){
  /* Function declarations stay outside the try: an ES5 build then keeps them plain (the loader budget is 2 KiB gzip). */
  /* A click (i) waits on the launcher, also during an eager load, and is replayed by cdn.js; an eager load alone leaves it usable and quiet. */
  function load(i){
    if(!user||!options.project)return;
    if(i){wanted=1;if(button)button.disabled=true;}
    if(loading)return;
    loading=true;
    var s=d.createElement('script');s.type='module';s.src=base+'cdn.js';if(nonce)s.nonce=nonce;
    s.onerror=function(){try{loading=false;if(button){button.disabled=false;if(wanted)button.setAttribute('aria-label',options.lang==='pl'?'Nie udało się wczytać uwag. Kliknij, aby ponowić.':'Could not load feedback. Click to retry.');}}catch(e){}};
    d.head.appendChild(s);
  }
  /* Eager SDK load: pinned markers, or (with a launcher, which draws the summary) tuix opened here for this project within 30 days. */
  function eager(){
    try{var s=localStorage,p=options.project,t=+s.getItem('tuix:active:'+p);return (s.getItem('tuix:markers:'+p)||'').indexOf('on:')===0||options.launcher!==false&&t>0&&new Date-t<2592e6;}catch(e){return false;}
  }
  function launcher(){
    if(host){host.remove();host=null;}
    if(!user||!options.project||w.Shopify&&w.Shopify.designMode)return;
    host=d.createElement('tuix-widget');host.setAttribute('data-tuix-bootstrap','');
    host.style.cssText='all:initial!important;position:fixed!important;z-index:2147483646!important;bottom:calc(16px + env(safe-area-inset-bottom,0px))!important;'+(options.position==='bottom-left'?'left':'right')+':16px!important;';
    var root=host.attachShadow({mode:'closed'}),style=d.createElement('style');if(nonce)style.nonce=nonce;
    function dot(id,path,label,command){var b=d.createElement('button');b.id=id;b.className='d';b.type='button';b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+path+'</svg>';b.setAttribute('aria-label',label);b.onclick=function(){stub(command);};root.appendChild(b);}
    style.textContent='button{all:initial;box-sizing:border-box;width:44px;height:44px;display:grid;place-items:center;background:#f0906a;color:#2b1812;border-radius:50%;cursor:pointer;font:700 13px/1 system-ui,sans-serif;letter-spacing:-.04em;box-shadow:0 0 22px 2px #f0906a57}button:focus-visible{outline:2px solid #8a3d1f;outline-offset:3px}button:disabled{cursor:wait}.d{position:absolute;left:4px;width:36px;height:36px;background:#fff;color:#231d3d;border:1px solid #d6cfea;box-shadow:none;opacity:0;visibility:hidden;transform:translateY(44px) scale(.4);transition:.3s}#g{bottom:96px}#r{bottom:52px}.d svg{width:18px}:host(:hover) .d,:host(:focus-within) .d{opacity:1;visibility:visible;transform:none}@media(prefers-reduced-motion:reduce){.d{transition:none}}@media(prefers-color-scheme:dark){button{background:#ffb38f}.d{background:#262041;color:#efeaff;border-color:#453b70}button:focus-visible{outline-color:#ffd3bf}}';
    button=d.createElement('button');button.id='tuix-launcher';button.type='button';button.setAttribute('aria-label','Open tuix feedback');button.textContent='tuix.';
    button.onclick=function(){stub('comment');};root.appendChild(style);if(options.launcher!==false){root.appendChild(button);dot('r','<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>','Reports','open');dot('g','<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>','Feedback settings','settings');}(d.body||d.documentElement).appendChild(host);
    if(options.showPinsOnLoad||/(?:\?|&)tuix=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:&|$)/i.test(w.location.search))stub('open');
    else if(eager())load();
  }
  function stub(command,value){
    try{
    q.push([command,value,(command==='open'||command==='comment')&&w.performance&&typeof w.performance.now==='function'?w.performance.now():undefined]);
    if(command==='init'||command==='config'){for(var k in value)if(Object.prototype.hasOwnProperty.call(value,k))options[k]=value[k];launcher();}
    if(command==='identify'){user=value;launcher();}
    if(command==='open'||command==='comment'||command==='settings')load(1);
    if(command==='destroy'){if(host)host.remove();host=null;user=null;options={};}
    }catch(e){loading=false;try{if(button)button.disabled=false;}catch(e){}}
  }
  try{
  if(!Element.prototype.attachShadow||w.tuix&&w.tuix.loaded)return;
  var prior=w.tuix,q=prior&&prior.q||[],options={},user=null,host,button,loading=false,wanted;
  var script=d.currentScript,base=script?script.src.replace(/[^/]*$/,'' ):'',nonce=script&&script.nonce;
  stub.q=q;stub.loaded=true;w.tuix=stub;
  var pending=q.slice();q.length=0;for(var i=0;i<pending.length;i++){try{stub.apply(null,pending[i]);}catch(e){}}
  }catch(e){}
})(window,document);
