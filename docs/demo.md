# Nomifier: 3-minute demo script

From the final writeup §6, with who does what (plan §13) and the fallbacks (writeup §8, plan §13).

**On screen the whole time:** "Demo values in Nomi's format, not Nomi's rubric. Not medical advice. Ask your
pharmacist."

## Roles

| Who   | Where                        | Does                                                                                                                     |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **B** | GPU laptop                   | Runs the server and `tailscale serve` / Funnel; watches the per-second log; restarts if needed                           |
| **C** | Laptop on the projector      | `?frame=iphone` mirror or AirPlay of the team iPhone; hands the judge the iPhone; narrates the AR                        |
| **A** | Grok + Cursor laptop         | Shows the Grok Bot screens live during Aisle Finder and Coverage Clerk; opens the PR and the Cursor PR log for the close |

## Set-up (before the judges arrive)

- Riser under the desk lamp with the demo products; the Advil bottle loose for the judge to pick up; the uncatalogued
  product in the bag.
- Profile "72, high blood pressure" (`adult_65_plus` + `hypertension`) and "adult" ready on the phone.
- Cabinet empty. Grok Bot tabs open on A's laptop: Aisle Finder, Coverage Clerk, the Label Watch Page, the PR list.
- Pre-flight: `curl https://<B>.<tailnet>.ts.net/api/health` returns `{"ok":true}`.

## The script

| Time | Beat | Who | What happens | Say |
| --- | --- | --- | --- | --- |
| 0:00–0:20 | Problem + concept reel | C | 8 s of the Publix reel | "Nomi scores one barcode. A real aisle is 40 look-alike boxes. This is a recording run through our pipeline; now the live app." |
| 0:20–1:10 | Live AR | C, judge | Judge holds the phone on "72, high blood pressure" and sweeps the riser: NSAIDs and Benadryl red, the cold medicine orange, Tylenol and Claritin green, arrows to the safer box. Switch to "adult": colors change instantly. Tylenol PM is gray and dashed until they turn it and the barcode locks it. They pick up the Advil bottle and the outline follows it. Tap it: Nomi's card, cited reasons, read aloud. | "No network call on the profile switch. A look-alike never gets a color until the barcode confirms it." |
| 1:10–1:30 | Cabinet | C | Add Tylenol to the cabinet, point at the NyQuil | "Also acetaminophen: you already take Tylenol." |
| 1:30–2:10 | Aisle Finder | A | Take Claritin off the riser; Benadryl's arrow disappears. Tap "Find the safer one nearby". Grok Bot finds store-brand loratadine, same 10 mg, in stock, cheaper, with a pickup order waiting. Judge taps **Approve** or **Reject**. | Name the features: webhook routine, taught task, computer use, "Ask first" rule. "It stops at the cart; paying stays with you." |
| 2:10–2:40 | Coverage Clerk | A | Take the bagged product out: thin gray. Tap it. The Clerk finds it on DailyMed, runs Nomi's validator, opens a PR. | "Every product a user meets makes Nomi bigger; a human approves every row." |
| 2:40–3:00 | Close | C, A | CV HUD numbers; the Label Watch Page with a ⚠ badge; the PR log | "The server sees images, the Bots see a product ID, a crop and a ZIP, and only the phone knows who it's for." |

## Fallbacks, in order

1. Installed PWA misbehaves (camera permission after relaunch): plain Safari, same URL.
2. iPhone streaming slow or venue network bad: desktop iPhone-frame mode (`?frame=iphone`) with the laptop webcam on
   `localhost`.
3. Everything else: the backup video.

Per beat:

- **Aisle Finder** blocked by a pharmacy site: "Route traffic through this computer", or show the labeled screenshot of
  an earlier run from `bots/screenshots/`.
- **Coverage Clerk** slow: open the PR it already made from a rehearsal run.
- **Label Watch** cut (plan §11): pitch it and show the ⚠ badge from the labeled demo toggle.
- **Detection** misses a product in hand: put it on the riser under the lamp, or lock it with the barcode.
