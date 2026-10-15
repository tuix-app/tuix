/* Storefront gate: shoppers and the theme editor load no modules or UI. */
(function(w,d){try{
  if(!Element.prototype.attachShadow||w.Shopify&&w.Shopify.designMode||d.documentElement.hasAttribute('data-tuix-shopify-bound'))return;
  var s=d.currentScript,p=s&&s.getAttribute('data-project');
  if(!p||!/^[a-zA-Z0-9_-]{1,128}$/.test(p))return;
  var u=new URL(w.location.href),invite=u.searchParams.get('tuix_review');
  if(invite!==null){u.searchParams.delete('tuix_review');w.history.replaceState(w.history.state,'',u.pathname+u.search+u.hash);}
  var name='__Host-tuix_review_'+p,match=d.cookie.match(new RegExp('(?:^|; )'+name+'=([a-zA-Z0-9_-]{43})(?:;|$)'));
  if(invite!=='signin'&&!/^[a-zA-Z0-9_-]{43}$/.test(invite||'')&&!match)return;
  d.documentElement.setAttribute('data-tuix-shopify-bound','');
  var module=d.createElement('script');module.setAttribute('data-tuix-storefront','');
  module.tuixBoot={project:p,api:s.getAttribute('data-api')||undefined,invitation:/^[a-zA-Z0-9_-]{43}$/.test(invite||'')?invite:undefined,session:match&&match[1],signIn:invite==='signin',template:s.getAttribute('data-template')||'index',handle:s.getAttribute('data-handle')||'',nonce:s.nonce};
  module.type='module';module.src=s.src.replace(/[^/]*$/,'')+'storefront.js';if(s.nonce)module.nonce=s.nonce;module.onerror=function(){try{delete module.tuixBoot;
    var host=d.createElement('tuix-review-retry'),root=host.attachShadow({mode:'closed'}),button=d.createElement('button');
    host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;';
    button.type='button';button.textContent=/^pl/.test(w.navigator.language)?'Nie udało się wczytać recenzji. Ponów logowanie.':'Review mode could not load. Retry sign-in.';
    button.style.cssText='all:initial;position:fixed;right:16px;bottom:16px;max-width:calc(100vw - 32px);padding:12px 16px;background:#f0906a;color:#2b1812;font:600 14px/1.5 sans-serif;cursor:pointer;pointer-events:auto;border-radius:12px;outline:revert;outline-offset:3px;';
    button.onclick=function(){var retry=new URL(w.location.href);retry.searchParams.set('tuix_review','signin');w.location.assign(retry.href);};
    root.appendChild(button);(d.body||d.documentElement).appendChild(host);
  }catch(_){}};d.head.appendChild(module);
}catch(_){}})(window,document);
