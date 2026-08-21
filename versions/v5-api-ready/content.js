(() => {
  function createBar() {
    if (document.getElementById("ia5-toolbar")) return;

    const bar = document.createElement("div");
    bar.id = "ia5-toolbar";
    bar.innerHTML = `
      <div class="ia5-title">Inbox Avenger v5</div>
      <div class="ia5-actions">
        <button id="ia5-note">Use the popup for full mailbox sync</button>
      </div>
    `;

    document.body.appendChild(bar);
    bar.querySelector("#ia5-note").addEventListener("click", () => {
      alert("Use the extension popup to sync Gmail API data and search the indexed mailbox.");
    });
  }

  createBar();
})();
