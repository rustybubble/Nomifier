# Dev fixtures (not real data)

Fake products (`99999…` NDCs), fake UNIIs (`DEV…`) and placeholder citations so System C can build the PWA
before A2/A3 land the real `data/` files. `tools/mock_ws.py` serves these at `/data/` whenever `data/<file>`
doesn't exist. **Never ship these as real scores.**

Expected scores (dev term table, base 100, `max_plus_stacking` 5):

| Product                                | adult_18_64 | adult_65_plus   | adult_65_plus + hypertension |
| -------------------------------------- | ----------- | --------------- | ---------------------------- |
| 101 Pain Relief ES (acetaminophen)     | 92 green    | 92 green        | 92 green                     |
| 202 Pain Relief PM (+ diphenhydramine) | 84 green    | red (hard stop) | red (hard stop)              |
| 303 Ibuprofen                          | 92 green    | 40 red          | 20 red                       |
| 404 Allergy (diphenhydramine)          | 92 green    | red (hard stop) | red (hard stop)              |
| 505 Loratadine                         | 100 green   | 100 green       | 100 green                    |
| 606 Cold & Flu Day                     | 84 green    | 84 green        | 64 yellow                    |
| 707 Mystery Remedy                     | unrated     | unrated         | unrated                      |
