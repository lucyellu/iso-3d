// Shared page chrome for the public edition: sidebar, theme toggle and footer.
(function () {
  var LOGO =
    '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
    '<path d="M32 32c0-3 4-3 4 0 0 5-8 5-8 0 0-8 12-8 12 0 0 11-16 11-16 0 0-14 20-14 20 0 0 17-24 17-24 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var PAGES = [
    ["index.html", "Overview"],
    ["works.html", "List of works"],
  ];
  var ELSEWHERE = [
    ["https://www.lulucy.org/", "lulucy.org"],
    ["https://lucylu.org/", "lucylu.org"],
    ["https://lucylu.org/apps/", "Apps & Games"],
    ["https://github.com/lucyellu", "GitHub"],
    ["https://www.youtube.com/@lucyxlu", "YouTube"],
    ["https://vimeo.com/lucylu", "Vimeo"],
    ["https://instagram.com/lucyellu", "Instagram"],
    ["https://x.com/laissez_fairie", "X"],
    ["https://www.linkedin.com/in/lucyluprofile/", "LinkedIn"],
  ];

  var body = document.body;
  var here = location.pathname.split("/").pop() || "index.html";
  if (PAGES.every(function (p) { return p[0] !== here; })) here = "index.html";

  function list(items, current) {
    return "<ul>" + items.map(function (p) {
      return '<li><a href="' + p[0] + '"' + (p[0] === current ? ' aria-current="page"' : "") + ">" + p[1] + "</a></li>";
    }).join("") + "</ul>";
  }

  var side = document.createElement("nav");
  side.className = "side";
  side.innerHTML =
    '<a class="logo" href="index.html">' + LOGO + "<b>Lucy Lu</b><small>wiki</small></a>" +
    "<h4>Articles</h4>" + list(PAGES, here) +
    "<h4>Elsewhere</h4>" + list(ELSEWHERE).replace("<ul>", '<ul class="elsewhere">');

  var main = document.querySelector(".main");
  var shell = document.createElement("div");
  shell.className = "shell";
  main.parentNode.insertBefore(shell, main);
  shell.appendChild(side);
  shell.appendChild(main);

  var tabs = document.createElement("div");
  tabs.className = "tabs";
  tabs.innerHTML =
    '<a href="index.html" class="on">Article</a>' +
    '<span class="gap"></span><button class="theme" type="button" aria-label="Toggle dark mode">◐ Theme</button>';
  main.insertBefore(tabs, main.firstChild);

  var root = document.documentElement;
  function stored() { try { return localStorage.getItem("prehistoria-theme"); } catch (e) { return null; } }
  if (stored()) root.dataset.theme = stored();
  tabs.querySelector(".theme").addEventListener("click", function () {
    var dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("prehistoria-theme", root.dataset.theme); } catch (e) {}
  });

  var content = main.querySelector(".content");
  var foot = document.createElement("div");
  foot.className = "footer";
  foot.innerHTML =
    "A wiki-style page about Lucy Lu's work, kept by Lucy Lu. Not affiliated with Wikipedia. " +
    '<a href="https://lucylu.org/">Back to lucylu.org</a>.';
  content.appendChild(foot);
})();
