const STORAGE_KEY = "autoSort";
const checkbox = document.querySelector<HTMLInputElement>("#autoSort");

if (checkbox) {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    checkbox.checked = (result[STORAGE_KEY] as boolean | undefined) ?? true;
  });

  checkbox.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEY]: checkbox.checked });
  });
}
