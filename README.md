# Stay — predict before you read

A small Chrome extension that, on claude.ai, blurs the answer until you write a one-line prediction. Then it pins your prediction above Claude's response and asks how close you were. Over time, your "Surprised %" becomes a calibration signal — proof that you're using AI to *learn*, not just to *consume*.

Built in 4 hours in response to [Ahmed Elassy's post](https://www.linkedin.com/in/ahmedelassy1) on the deep-work cost of agentic AI.

## What it does

1. Send a prompt on `claude.ai`.
2. The assistant message appears blurred. A panel above asks you to write your prediction — one line, rough is fine.
3. Hit Reveal. Blur lifts. Your prediction stays pinned above the answer.
4. Tap calibration: **Knew it** / **Partial** / **Surprised**.
5. A small widget bottom-right tracks your 7-day stats — total predictions and Surprised %.
6. Bonus: if you switch tabs while Claude is generating, on return you see a soft "you stepped away mid-thought — anything to add?" prompt. Always dismissable.

## Install (60 seconds)

1. Open `chrome://extensions` in Chrome / Brave / Arc / Edge.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select this folder (the one with `manifest.json` in it).
5. Open `claude.ai`. Send a prompt. Stay should activate when Claude responds.

To turn it off temporarily: click the Stay icon in the toolbar, toggle off.
To uninstall: `chrome://extensions` → Stay → Remove.

## If it doesn't activate

Claude.ai's DOM is React-rendered and class names occasionally shift between releases. Stay tries a list of selector candidates in priority order; if Anthropic ships a structural change, the first selector miss can leave the extension idle.

To debug: open the popup (Stay icon in toolbar). It will show whether the content script attached to the current page. If it didn't, please file an issue with your `chrome://version` output and a screenshot of the popup. Fix is usually a one-line selector update.

## Privacy

- No backend. No analytics. No telemetry. No accounts.
- Your predictions are stored in `chrome.storage.local` — your browser, your machine.
- You can clear them by removing the extension.

## What's in the box

- `manifest.json` — Chrome Manifest v3 declaration. Targets `https://claude.ai/*`.
- `content.js` — the mechanic. Watches for assistant messages on claude.ai (multiple resilient selectors), blurs them, injects the predict-panel, handles reveal + calibration.
- `styles.css` — visual layer. Native-feeling, dark-mode aware.
- `popup.html` + `popup.js` — toolbar dashboard with 7-day stats.
- `demo.html` — a Claude-shaped mock page so you (or anyone) can try the mechanic without being logged into Claude. Open it directly in your browser.

## Not in the box yet

- **ChatGPT support** — shipping next. Same mechanic, different host.
- **CLI / IDE shim** — for people whose AI lives in the terminal or VS Code. Mapping it out.
- **Export your prediction history** — small feature, if anyone asks.

## License

MIT. Fork it. Improve it. Send a PR.

## Author

Ahmed Saleh — co-founder & PM at Qupil. [LinkedIn](https://linkedin.com/in/ahmednsalehm)
