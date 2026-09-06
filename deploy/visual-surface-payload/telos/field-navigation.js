(() => {
  const destinations = { ArrowLeft: "https://rootlogos.com/", ArrowRight: "https://rootlogos.com/" };
  addEventListener("keydown", event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.target.closest("a,button,input,textarea,select,[contenteditable]")) return;
    if (!destinations[event.key]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destinations[event.key]);
  }, true);
})();
