# Clevertree Chat — Living Commons

## UX narrative
A visitor opens the extension on any ordinary website and immediately enters the live shared #web IRC room. Existing history loads; domain attribution is visible before send. SI presents structured discussion, findings and sources. A Paradigm Threat reader opens the site header chat button and enters the one repo room #pt with topic attribution from a human-maintained index. Extension takes precedence; otherwise the same shell docks on the page. A MyProblem collection can select its configured channel. A Networker explicitly enables the mode in extension Options, then uses Gather, Track, Refresh and Tests in an additive header strip. Normal IRC and SI remain intact.

## Information architecture
```
Host adapter: Chrome side panel | page dock | full-page lobby
  SharedRoomShell
    NetworkerToolbar (extension only, enabled in Options)
    RoomHeader (brand, SI toggle, host controls)
    ResponsivePaneLayout
      IRCRoom (channel/status, history, renderer, composer)
      SIPanel (batch activity, indexed topics, findings, CleverScript)
    Shared room state
ExtensionOptions (separate route; Networker, appearance)
```
IRC and SI independently scroll. SI may hide without leaving IRC. No alternate debate widget. Batch providers: Groq, Bedrock or peers, no GPU farm. SI reads conversation and human index, produces versioned findings with provenance; cannot vote, pick winners, alter standing exceptions or mint topics.

## Layout and theme
- Below 700px: stacked IRC and SI, default 62/38; expanded SI gets about 57%. At 360–420px keep composer and SI reachable. Mobile composer stays above software keyboard in production.
- 700–1099px: 55/45 side by side; 1100px+ wider cards, adjustable divider. Bottom/top dock initially ~40–50% of viewport; left ~410px. Full-page lobby same components. Resize on exposed edge.
- Empty #web: connected state, public-room explanation, current domain and composer. Never fabricate activity. Empty SI: waiting for conversation.
- Light: off-white canvas, white IRC, sage SI and forest accent. Dark: deep green-charcoal canvas, distinct IRC/SI/card surfaces, soft sage accents, no glow or inversion. Use semantic tokens. System theme follows OS/browser dynamically; light/dark overrides are preferences. Set color-scheme for native controls; respect reduced motion. Source Sans 3, IBM Plex Serif, IBM Plex Mono with local fallbacks; 4/8/12/16/24/32/48 spacing, modest radii.

## Channels and attribution
| Context | Channel | Trailing tag | Render |
|---|---|---|---|
| PT and similar | configured repo room | `[[t:N]]` | canonical topic link; 0 general |
| MyProblem | configured collection room | repo-specific | collection/topic chip |
| Everywhere else | `#web` | `[[d:example.com]]` | domain chip → https://example.com/ |

Normalize hostname, strip www., never auto-include path/query/fragment/title/history. Parse recognized trailing metadata only; literal code stays visible. Unknown topic: unavailable, no invented URL. Topic chips navigate, never switch room. Optional domain removal is proposed. Keep draft channel/context stable during tab switching.

## Inventory and states
| Component | States |
|---|---|
| Room header | Connecting, connected, reconnecting, offline |
| History/mirror | Loading, populated, empty, failed, cached, delayed, older history |
| Message | Normal, pending, failed, selected, system; safe Markdown and configured media |
| Composer | Empty, typing, multiline, sending, failed, unavailable |
| Attribution | Domain, topic, collection, general, unavailable |
| Scroll control | Following live, reading history, new messages |
| SI | Compact, expanded, hidden; empty, loading, populated, error |
| Batch | Waiting, queued, processing, fresh, stale, failed; retain previous output |
| SI cards | Indexed topics, synthesis, questions, evidence, map, timeline, graphics, structured findings |
| CleverScript controls | Idle, selected, loading, disabled, success, failure |
| Host | Resize, position, close |
| Networker | Absent by default; idle, running, completed, stopped, failed when enabled |

## SI and CleverScript
Indexed topics human/admin curated only; SI may organize temporary discussion themes but never register topic IDs. Distinguish participant claims, cited evidence and SI interpretation. Preserve provenance and uncertainty, no artificial credibility/winner scores. Shared renderer owns accessible UI primitives; repo registers behavior. Examples: PT compare accounts/locate source; MyProblem compare approaches/group observations; #web expand evidence/filter domains. Illustrative declaration, not actual known CleverScript syntax:
```json
{"type":"button","label":"Compare accounts","action":"pt.compareAccounts","payload":{"findingId":"finding-42"}}
```
Validate actions, URLs and parameters, deny unregistered execution and writes to topic index. No arbitrary browsing data access.

## Interaction and accessibility
- Opening focuses heading or meaningful control, not forced mobile keyboard. Close restores invoking button. Desktop Enter sends; Shift+Enter newline; IME composing never sends. Mobile visible send button; Enter newline. Preserve draft through reconnect, SI updates and resize.
- IRC follows live only near bottom; older history prepend preserves first visible message. Else show unread/back-to-live. SI stable card IDs preserve expanded state and anchor; new findings indicator rather than scroll jumps.
- Locate source loads if necessary, scrolls IRC, highlights and preserves SI. Source absent: explicit message. Do not steal focus.
- SI toggle uses aria-expanded/aria-controls, returns focus if hidden. Hiding does not cancel subscriptions or batches. Restore prior state.
- Site button uses explicit extension handshake; toggle existing Chrome side panel if installed, otherwise mount dock. No competing dock during detection. Article links only open surface. Close distinct from leave. Verify actual Chrome APIs.
- Remember position per site, size per orientation, divider per layout, SI visibility, selected topic and draft per channel; Networker in Options only. Clamp viewport. Keyboard-accessible separators.
- Named landmarks and log, polite live regions, no bulk-history announcements. Visible focus; WCAG AA target; touch-friendly 44px targets where possible; textual graph equivalents; reduced motion; no color-only meaning.
- IRC connectivity, mirror freshness, and SI health independent. Preserve draft; do not blindly retry uncertain delivery.

## Copy sheet
| Purpose | Copy |
|---|---|
| Entry | Chat / Open chat |
| Pane | IRC room / SI panel |
| SI control | Show SI panel / Hide SI panel / Expand SI panel |
| Composer | Message #web… / Send message |
| Scroll | Back to live / 3 new messages |
| Evidence | View findings / Show evidence / Locate message |
| Topic | Open topic / Topic N · Unavailable |
| Dock | Dock left / Dock bottom / Dock top |
| Connection | Connecting to IRC… / Connected |
| Reconnect | Reconnecting… Your draft is saved. |
| Offline | Connection lost. You can continue drafting. |
| History | Loading conversation… / Conversation history is unavailable. |
| Mirror | History is catching up. Live chat is connected. |
| Empty | You're in #web. One public room for people exploring the web. No messages to display yet. Start a discussion about what you're reading. |
| Failed send | Message not sent. Retry or edit. |
| SI empty | Topics and findings will appear as discussion develops. |
| SI queued | Waiting for the next batch |
| SI loading | Reviewing conversation… |
| SI updated | Updated at 10:31 AM / New findings available |
| SI partial | Additional findings are being prepared. |
| SI failed | SI temporarily unavailable. Showing the last successful findings. |
| Unsupported | This finding cannot be displayed in the current version. |
| Action error | This action could not be completed. |
| Public notice | Messages in this room are public. |
| Privacy | Your message can include the current website's domain, but not the full page address. |
| First run | Clevertree Chat is a public IRC conversation. Messages may be retained in conversation history and processed by SI to organize discussion and findings. |
| SI purpose | SI organizes conversation into topics, summaries and findings. It does not vote or decide who is right. |
| Index | Indexed topics are maintained by people. |

Networker Options (separate page only): Enable Networker mode. Off by default. Enable additional tools for gathering, tracking and refreshing browsing context alongside IRC conversations. Networker controls appear above the room when enabled. Normal IRC and SI remain unchanged. Enabling the toolbar does not start collection automatically.

## Deliberate removals
No split extension/chat kits, standalone debate widget, in-article embeds, website whitelist, per-domain/page rooms, full-path attribution, raw trailing tags, main-panel Networker switch, default Refresh/Gather/Track/Collect/Automate/Tests, SI-created official topics, AI voting/winners/standing exceptions, fixed universal gadgets, GPU farm or Flashback topology.

## Acceptance
One shared component in every host; #web on arbitrary sites; first-run history; separate Options; additive Networker toolbar; independent scrolling; SI toggle and four states; repo-defined interactive controls; canonical domain/topic attribution; draft and anchor preservation; no duplicate dock; mobile and narrow support; keyboard and accessible labels; system appearance updates immediately. Validate real service integration before release.
