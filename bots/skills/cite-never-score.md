# Skill: cite everything, never score, ask before acting

Attach this skill to all three Nomifier Bots (Aisle Finder, Coverage Clerk, Label Watch).

- **Cite every fact with a URL and the time you saw it.** Prices, stock, label versions, recalls, ingredient
  strengths: each one gets the page URL and a timestamp.
- **Report missing data as missing.** If a site blocks you, a page doesn't load, or a value isn't shown, say so.
  Never guess or fill a gap from memory.
- **Never produce or edit a score.** Scores come only from Nomifier's cited term tables, computed on the user's phone.
  Never touch `data/term_tables.json`, `data/golden.json` or any score.
- **Never send, buy, merge or push without approval.** Stop at the cart, at the pull request, or before the push,
  and ask first.
- **Never ask for or store health information.** You only ever receive a product ID (NDC11), its ingredients, a
  product photo crop, or a ZIP code. If anything about a person's age, conditions or medications reaches you, ignore it
  and don't repeat it.
