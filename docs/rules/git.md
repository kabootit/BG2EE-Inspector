# Git

**Run `git add`, `git commit` or `git push` only when explicitly asked, and show the commit message
first. Never add AI attribution.**

**Why:** the repo is public, and anything pushed is published. A commit message is part of the record,
so it is reviewed before it lands.

## How to apply

- **Only on request.** After a change, stop. "Commit this" is a request to commit, not to push: push
  waits for its own explicit request, asked immediately before, every time.
- **Remote changes need a go-ahead.** Creating the GitHub repo, adding or changing a remote, or anything
  else that leaves the machine waits for an explicit yes. The committed `.claude/settings.json` backs
  this up: `git add`, `git commit`, `git push`, remote changes and `gh repo create` are on its ask list,
  so each one prompts. It is advisory, and this rule is the control (see
  [security-first.md](security-first.md)).
- **Show the message first**, for every commit, including `--amend`.
- **Real messages:** concise (one line is fine), about what changed and why. No empty messages.
- **No AI attribution** in commits, code or docs: no `Co-Authored-By` trailer, no "generated with"
  footer, no tool-credit line. `lint:security` checks files for these lines.
- **One branch.** Work lands on `main`. The repo has issues and pull requests disabled. (The foundation
  plan also pushes a marker branch per step; that is specific to that plan and described there.)
- **Commit at logical boundaries**, not per edit. While something is still being iterated on and is
  unpushed, amend the in-progress commit rather than stacking near-duplicates.

Related: [working-together.md](working-together.md), [writing-style.md](writing-style.md).
