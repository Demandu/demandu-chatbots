/*!
 * Demandu · Widget de chat para sitios web
 * Se instala con:
 *   <script src="https://TU-DOMINIO/widget.js" data-bot="ID-DEL-BOT" async></script>
 *
 * Usa Shadow DOM para que los estilos del sitio del cliente no lo afecten
 * (ni el widget afecte al sitio).
 */
(function () {
  "use strict";

  var current = document.currentScript;
  if (!current) {
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("widget.js") !== -1) { current = all[i]; break; }
    }
  }
  if (!current) return;

  var BOT_ID = current.getAttribute("data-bot") || "";
  if (!BOT_ID) return;

  var API = new URL(current.src, location.href).origin + "/api/webchat";
  var KEY = "demandu_chat_" + BOT_ID;
  var sessionId = "";
  try {
    sessionId = localStorage.getItem(KEY) || "";
    if (!sessionId) {
      sessionId = "w-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
      localStorage.setItem(KEY, sessionId);
    }
  } catch (e) {
    sessionId = "w-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
  }

  var cfg = {
    color: "#6E42FF",
    position: "right",
    title: "¿Podemos ayudarte?",
    subtitle: "Normalmente respondemos al instante",
    greeting: "",
    launcher: "Chatea con nosotros",
  };

  var host = document.createElement("div");
  host.setAttribute("data-demandu-widget", "");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  document.body.appendChild(host);

  var style = document.createElement("style");
  root.appendChild(style);
  var wrap = document.createElement("div");
  root.appendChild(wrap);

  function css() {
    var side = cfg.position === "left" ? "left" : "right";
    return "" +
      ":host{all:initial}" +
      "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif}" +
      ".launcher{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;display:flex;align-items:center;gap:10px;" +
        "border:0;border-radius:999px;padding:13px 20px;cursor:pointer;color:#fff;font-size:15px;font-weight:600;" +
        "background:" + cfg.color + ";box-shadow:0 8px 30px -6px rgba(0,0,0,.35);transition:transform .15s}" +
      ".launcher:hover{transform:translateY(-2px)}" +
      ".launcher svg{width:22px;height:22px;flex:none}" +
      ".panel{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;width:370px;max-width:calc(100vw - 32px);" +
        "height:560px;max-height:calc(100vh - 40px);display:none;flex-direction:column;overflow:hidden;" +
        "background:#fff;border-radius:18px;box-shadow:0 18px 60px -12px rgba(0,0,0,.35)}" +
      ".panel.open{display:flex}" +
      ".head{flex:none;padding:16px 18px;color:#fff;background:" + cfg.color + ";display:flex;align-items:flex-start;gap:10px}" +
      ".head h3{margin:0;font-size:16px;font-weight:700}" +
      ".head p{margin:2px 0 0;font-size:12px;opacity:.9}" +
      ".close{margin-left:auto;background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;opacity:.85;padding:0 2px}" +
      ".close:hover{opacity:1}" +
      ".body{flex:1;overflow-y:auto;padding:16px;background:#f4f5fb;display:flex;flex-direction:column;gap:8px}" +
      ".msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
      ".bot{align-self:flex-start;background:#fff;color:#1b1c39;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.06)}" +
      ".me{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;background:" + cfg.color + "}" +
      ".opts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%}" +
      ".opt{border:1px solid " + cfg.color + ";background:#fff;color:" + cfg.color + ";border-radius:999px;" +
        "padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer}" +
      ".opt:hover{background:" + cfg.color + ";color:#fff}" +
      ".typing{align-self:flex-start;background:#fff;border-radius:14px;padding:10px 13px;display:flex;gap:4px;box-shadow:0 1px 2px rgba(0,0,0,.06)}" +
      ".typing i{width:6px;height:6px;border-radius:50%;background:#b9bcd4;display:block;animation:bl 1.2s infinite}" +
      ".typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}" +
      "@keyframes bl{0%,60%,100%{opacity:.35}30%{opacity:1}}" +
      ".foot{flex:none;display:flex;gap:8px;padding:10px;border-top:1px solid #e6e8f2;background:#fff}" +
      ".foot input{flex:1;border:1px solid #e2e4f0;border-radius:999px;padding:11px 15px;font-size:14px;color:#1b1c39;outline:none}" +
      ".foot input:focus{border-color:" + cfg.color + "}" +
      ".send{border:0;border-radius:50%;width:42px;height:42px;flex:none;cursor:pointer;color:#fff;background:" + cfg.color + ";display:grid;place-items:center}" +
      ".send:disabled{opacity:.5;cursor:default}" +
      ".send svg{width:18px;height:18px}" +
      ".brand{flex:none;text-align:center;font-size:10px;color:#9498b8;padding:0 0 8px;background:#fff}" +
      "@media(max-width:420px){.panel{width:calc(100vw - 24px);height:calc(100vh - 90px)}}";
  }

  function render() {
    style.textContent = css();
    wrap.innerHTML =
      '<button class="launcher" part="launcher">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/></svg>' +
        "<span>" + esc(cfg.launcher) + "</span></button>" +
      '<div class="panel">' +
        '<div class="head"><div><h3>' + esc(cfg.title) + "</h3><p>" + esc(cfg.subtitle) + "</p></div>" +
          '<button class="close" aria-label="Cerrar">&times;</button></div>' +
        '<div class="body"></div>' +
        '<div class="foot"><input type="text" placeholder="Escribe tu mensaje…" />' +
          '<button class="send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-6-6 18-3.5-7.5L3 11Z"/></svg></button></div>' +
        '<div class="brand">con tecnología de Demandu</div>' +
      "</div>";

    q(".launcher").addEventListener("click", open);
    q(".close").addEventListener("click", close);
    q(".send").addEventListener("click", sendInput);
    q(".foot input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendInput(); }
    });
  }

  function q(sel) { return wrap.querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var started = false;
  var busy = false;
  /** Hasta donde el visitante ya tiene todo pintado. Lo manda el servidor. */
  var desde = "";

  /**
   * La marca solo avanza, nunca retrocede.
   *
   * Dos respuestas pueden llegar desordenadas (el sondeo y el envio van por
   * separado). Si una vieja pisara a una nueva, el siguiente sondeo volveria a
   * traer mensajes ya pintados y el visitante los veria DUPLICADOS.
   */
  function avanzar(marca) {
    if (!marca) return;
    if (!desde || String(marca) > String(desde)) desde = String(marca);
  }
  /** Ya se le avisó de que lo atiende una persona (para no repetirlo). */
  var avisadoAsesor = false;
  var sondeo = null;

  /**
   * Pregunta al servidor si hay mensajes nuevos.
   *
   * POR QUE EXISTE: sin esto el widget solo hablaba cuando le hablaban, asi que
   * lo que escribia un agente desde la Bandeja NUNCA llegaba al visitante — y
   * el widget acababa de prometerle que "un asesor continuara contigo por aqui".
   */
  function preguntar() {
    if (busy || document.hidden) return;
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId: BOT_ID, sessionId: sessionId, poll: true, desde: desde }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data) return;
        avanzar(data.desde);
        (data.messages || []).forEach(function (m) { if (m.text) bubble(m.text, false); });
        if (data.handedOff) avisarAsesor();
      })
      .catch(function () { /* si falla una vuelta, se reintenta en la siguiente */ });
  }

  function avisarAsesor() {
    if (avisadoAsesor) return;
    avisadoAsesor = true;
    bubble("Un asesor continuará contigo por aquí.", false);
  }

  function arrancarSondeo() {
    if (sondeo) return;
    // Cada 4 s mientras el chat esta abierto. Se para al cerrarlo para no
    // molestar al sitio del cliente con peticiones que nadie va a leer.
    sondeo = setInterval(preguntar, 4000);
  }
  function pararSondeo() {
    if (sondeo) { clearInterval(sondeo); sondeo = null; }
  }

  function open() {
    q(".panel").classList.add("open");
    q(".launcher").style.display = "none";
    if (!started) { started = true; post({ start: true }); }
    arrancarSondeo();
    setTimeout(function () { var i = q(".foot input"); if (i) i.focus(); }, 60);
  }
  function close() {
    q(".panel").classList.remove("open");
    q(".launcher").style.display = "";
    pararSondeo();
  }

  function bubble(text, mine) {
    var d = document.createElement("div");
    d.className = "msg " + (mine ? "me" : "bot");
    d.textContent = text;
    q(".body").appendChild(d);
    scroll();
  }

  function options(list) {
    var box = document.createElement("div");
    box.className = "opts";
    list.forEach(function (b) {
      var el = document.createElement("button");
      el.className = "opt";
      el.textContent = b.label;
      el.addEventListener("click", function () {
        box.remove();
        bubble(b.label, true);
        post({ text: b.id });
      });
      box.appendChild(el);
    });
    q(".body").appendChild(box);
    scroll();
  }

  function typing(on) {
    var ex = q(".typing");
    if (!on) { if (ex) ex.remove(); return; }
    if (ex) return;
    var d = document.createElement("div");
    d.className = "typing";
    d.innerHTML = "<i></i><i></i><i></i>";
    q(".body").appendChild(d);
    scroll();
  }

  function scroll() {
    var b = q(".body");
    if (b) b.scrollTop = b.scrollHeight;
  }

  function sendInput() {
    var input = q(".foot input");
    var v = (input.value || "").trim();
    if (!v || busy) return;
    input.value = "";
    bubble(v, true);
    post({ text: v });
  }

  function post(payload) {
    busy = true;
    q(".send").disabled = true;
    typing(true);
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: BOT_ID,
        sessionId: sessionId,
        text: payload.text || "",
        start: !!payload.start,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        typing(false);
        if (data && data.widget) {
          var changed = JSON.stringify(data.widget) !== JSON.stringify(cfg);
          cfg = Object.assign(cfg, data.widget);
          if (changed) style.textContent = css();
        }
        if (data) avanzar(data.desde);
        var msgs = (data && data.messages) || [];
        if (payload.start && !msgs.length && cfg.greeting) bubble(cfg.greeting, false);
        msgs.forEach(function (m) {
          if (m.text) bubble(m.text, false);
          if (m.buttons && m.buttons.length) options(m.buttons);
        });
        // Se avisa UNA vez, no en cada mensaje que mande el visitante.
        if (data && data.handedOff) avisarAsesor();
      })
      .catch(function () {
        typing(false);
        bubble("No pudimos conectar. Inténtalo de nuevo en un momento.", false);
      })
      .then(function () {
        busy = false;
        var s = q(".send");
        if (s) s.disabled = false;
      });
  }

  render();
})();
