# Test inventory

Generated 2026-09-29 from `vitest run`: **325 tests** — 315 passed, 0 failed, 10 todo.

Every test in [client/__tests__/](../client/__tests__/), grouped by file and `describe` block, with the production function each group exercises (`→`). For *why* each test exists and how the mocks work, see [tests.md](./tests.md).

## Tests that do not exercise production code (46)

These groups test a copy of the logic defined inside the test file (or a simulator / placeholder). A change to the real code will not make them fail.

| Group | File | Tests | What it actually tests |
|---|---|---|---|
| create-case | cases.test.ts | 4 | Inline `createCase()` |
| archive-case | cases.test.ts | 3 | Inline mirror of the requestee dashboard archive action |
| restore-case | cases.test.ts | 2 | Inline mirror of the restore action |
| confirm-schedule | cases.test.ts | 2 | Inline `respondToSchedule()` |
| propose-schedule | cases.test.ts | 2 | Inline mirror of the action in `app/dashboard/Admin/page.tsx` |
| update-password | authentication.test.ts | 3 | Mocked Supabase client + inline validator |
| confidentiality-gate | authentication.test.ts | 2 | Inline mirror of the check in `app/dashboard/page.tsx` |
| RLS (all six groups) | rls.test.ts | 18 | TypeScript RLS simulator, not real Postgres |
| create-profile / update-profile-self / update-profile-admin | participants.test.ts | 6 | `it.todo` placeholders |
| matchParticipantToFilter | match-participant-to-filter.test.ts | 4 | `it.todo` placeholders; the function does not exist yet |

Also: the invalid-URL test in `add-drive-link.test.ts` checks validation done by the test wrapper, not by `addDriveLink` itself.

## Full list

### client/__tests__/age-gate.test.ts (13)


**ageOn** → `ageOn — lib/age-gate.ts`

1. counts a birthday that has already happened this year ✅
2. does not count a birthday later this year ✅
3. counts the birthday itself ✅
4. is one short the day before the birthday ✅
5. treats a Feb 29 birthday as reached on Mar 1 in non-leap years ✅
6. rejects dates that don't exist ✅
7. rejects anything that isn't YYYY-MM-DD ✅

**dateOfBirthError** → `dateOfBirthError — lib/age-gate.ts`

8. accepts someone who turns 18 today ✅
9. rejects someone one day short of 18 ✅
10. rejects a child under 13 (the COPPA threshold) ✅
11. asks for a date when none is given ✅
12. rejects future dates and implausible ages as invalid, not underage ✅

**todayIso** → `todayIso — lib/age-gate.ts`

13. formats the local date zero-padded for a date input's max ✅

### client/__tests__/api-route-handlers.test.ts (22)


**API Route Handlers > zip-lookup.test.ts** → `GET — app/api/zip-lookup/route.ts`

14. Valid ZIP code ✅
15. Invalid ZIP format ✅
16. Upstream timeout handling ✅
17. County lookup failure ✅

**API Route Handlers > convert-heic.test.ts** → `POST — app/api/convert-heic/route.ts`

18. Valid HEIC conversion ✅
19. Reject non-HEIC files ✅
20. Oversized payload rejection ✅
21. Non-form-data body is a 400, not a 500 ✅
22. Missing file field is a 400 ✅
23. Text value in the file field is a 400 ✅

**API Route Handlers > email-action.test.ts** → `GET — app/api/email-action/route.ts (+ generateEmailActionToken)`

24. Accept action success ✅
25. Decline action success ✅
26. Expired token ✅
27. Tampered signature ✅
28. Already responded ✅
29. Session full ✅
30. Accepted onto the waitlist ✅
31. Session already started ✅
32. Incomplete profile ✅

**API Route Handlers > auth-confirm.test.ts** → `GET — app/auth/confirm/route.ts`

33. Valid token ✅
34. Expired token ✅
35. Missing token ✅

### client/__tests__/authentication.test.ts (20)


**Authentication > signup-with-custom-email.test.ts** → `signupWithCustomEmail — app/auth/actions.ts`

36. Participant role signup ✅
37. Requestee role signup ✅
38. Duplicate email handling ✅
39. Missing role parameter ✅
40. Admin role is rejected (no self-service privilege escalation) ✅
41. Under-18 date of birth is rejected before any account is created ✅
42. Missing or malformed date of birth is rejected (server action called directly) ✅
43. Date of birth is checked but not stored on the auth user ✅

**Authentication > reset-password-with-custom-email.test.ts** → `resetPasswordWithCustomEmail — app/auth/actions.ts`

44. Known email ✅
45. Unknown email (no information leakage) ✅

**Authentication > update-password.test.ts** → `(none — mocked Supabase client + inline validator)`

46. Valid recovery session ✅
47. Expired session ✅
48. Mismatched password confirmation ✅

**Authentication > middleware.test.ts** → `updateSession — lib/supabase/proxy.ts`

49. Unauthenticated redirect ✅
50. Authenticated pass-through ✅
51. Role-based redirect on /dashboard ✅
52. Public legal pages are reachable logged out ✅
53. Public allowlist matches on a path boundary, not a prefix ✅

**Authentication > confidentiality-gate.test.ts** → `(none — inline checkGate() mirror of app/dashboard/page.tsx)`

54. Requestee blocked without agreement ✅
55. Access allowed with agreement ✅

### client/__tests__/case-lineage.test.ts (13)


**case-lineage involvement classification** → `getLineageParticipantInvolvement, getLineageParticipantIds, isLineageBlocking — lib/case-lineage.ts`

56. blocks someone who accepted a case in the chain ✅
57. frees someone who accepted but was struck — they never sat on the case ✅
58. frees someone who declined ✅
59. treats a 'rejected' status the same as declined ✅
60. frees an unanswered invite once its session is in the past ✅
61. blocks an unanswered invite while its session is still upcoming ✅
62. counts a session dated today as upcoming, not past ✅
63. lets the blocking involvement win when someone appears twice in the chain ✅
64. frees a waitlister who was never called into the meeting ✅
65. blocks a waitlister who WAS called in, because the call-in makes them accepted ✅
66. returns nothing for a case with no sessions ✅

**splitLineageInvolvement** → `splitLineageInvolvement, isLineageBlocking — lib/case-lineage.ts`

67. separates blocking ids from history worth showing ✅
68. agrees with isLineageBlocking ✅

### client/__tests__/cases.test.ts (22)


**Cases > create-case.test.ts** → `(none — inline createCase() mirror in the test)`

69. Happy path ✅
70. Missing required field ✅
71. Non-requestee blocked ✅
72. Oversized files rejected ✅

**Cases > approve-case.test.ts** → `approveCaseAction — lib/actions/adminCase.ts`

73. Updates admin_status ✅
74. Sends approval email ✅
75. Non-admin blocked ✅

**Cases > reject-case.test.ts** → `rejectCaseAction — lib/actions/adminCase.ts`

76. Updates status ✅
77. Records rejection_reason ✅
78. Sends rejection email ✅
79. Non-admin blocked ✅

**Cases > archive-case.test.ts** → `(none — inline archiveCase() mirror of requestee dashboard action)`

80. Requestee archives own case ✅
81. Admin archives any case ✅
82. Requestee blocked from archiving others' cases ✅

**Cases > restore-case.test.ts** → `(none — inline restoreCase() mirror)`

83. Admin restore success ✅
84. Requestee blocked ✅

**Cases > update-case-filters.test.ts** → `updateCaseFilters — app/dashboard/requestee/actions/updateCaseFilters.ts; applyEducationAutoSelect — lib/education-hierarchy.ts`

85. Filter JSON persisted ✅
86. Education hierarchy auto-fill respected ✅

**Cases > confirm-schedule.test.ts** → `(none — inline respondToSchedule() mirror)`

87. pending → accepted ✅
88. Admin reschedule resets status ✅

**Cases > propose-schedule.test.ts** → `(none — inline mirror of Admin/page.tsx action)`

89. Sets admin_scheduled_at ✅
90. Resets schedule_status when schedule changes ✅

### client/__tests__/delivery-mode.test.ts (37)


**normalizeDeliveryMode** → `normalizeDeliveryMode — lib/case/deliveryMode.ts`

91. passes through the two real values ✅
92. degrades anything unrecognised to online, never to the in-person rate ✅

**isOffline / deliveryModeLabel** → `isOffline, deliveryModeLabel — lib/case/deliveryMode.ts`

93. reads the mode the same way normalize does ✅
94. labels for humans ✅

**sessionDeliveryMode** → `sessionDeliveryMode, sessionDeliveryModeOrDefault — lib/case/deliveryMode.ts`

95. is null for a session with no cases — there is nothing to derive from ✅
96. returns the shared mode ✅
97. treats a null case mode as online rather than as a disagreement ✅
98. throws on a mixed session instead of guessing a rate ✅
99. has a non-throwing twin for read-only surfaces ✅

**assertCasesShareDeliveryMode** → `assertCasesShareDeliveryMode — lib/case/deliveryMode.ts`

100. accepts an all-online or all-offline set ✅
101. accepts an empty set — attaching nothing conflicts with nothing ✅
102. rejects a mix within the incoming cases ✅
103. rejects an incoming case that clashes with what is already attached ✅
104. accepts an incoming case matching what is already attached ✅

**requestee pricing** → `baseRatePerHourCents, calculateReceiptPrice, formatCents — lib/receipt-pricing.ts`

105. charges $850/hr online and $1,500/hr in person ✅
106. defaults to the online rate when no mode is passed ✅
107. keeps the $100 filter add-ons on top of the in-person rate ✅
108. reports the rate it used so the receipt can show it ✅

**participant payout** → `hourlyRateCents, seatPayoutCents, waitlistPayoutCents — lib/participant/waitlist.ts`

109. pays $30/hr online and $40/hr in person ✅
110. defaults to the online rate when no mode is passed ✅
111. scales the seat payout by session length ✅
112. pays a called-in waitlister at the session's rate ✅
113. pays the waiting fee at the session's own flat rate ✅

**waitlist terms** → `waitlistCapFor, waitlistHoldMinutes, waitlistWaitFeeCents — lib/participant/waitlist.ts`

114. offers the same number of slots in both formats ✅
115. holds an in-person waitlister twice as long ✅
116. pays an in-person waitlister three times the waiting fee ✅

**county name matching** → `normalizeCountyName, countyMatches, countyQueryForms — lib/filter-utils.ts`

117. treats the stored and picker spellings as the same county ✅
118. keeps multi-word counties intact ✅
119. does not confuse Harris with Harrison ✅
120. an empty filter matches everyone; an empty value matches nothing ✅
121. queries both stored spellings, never a prefix wildcard ✅

**in-person catchment** → `OFFLINE_CATCHMENT_COUNTIES — lib/constants/offline-catchment.ts; withCountyRestriction, relaxFilters — lib/filter-utils.ts`

122. is the six counties around the venue ✅
123. matches participants however their county is spelled ✅
124. excludes the counties the panel actually lives in ✅
125. is NOT expressed as a location filter, so relaxation cannot drop it ✅
126. an in-person case no longer forces its own county into the filters ✅
127. still honours an explicit 'participants from my county' request ✅

### client/__tests__/documents-drive-links.test.ts (10)


**Documents & Drive Links > upload-case-document.test.ts** → `uploadCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

128. Correct storage path ✅
129. case_documents row created ✅
130. Requestee-only access ✅
131. File-name attestation required ✅

**Documents & Drive Links > delete-case-document.test.ts** → `deleteCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

132. Removes file and database row ✅
133. Owner-only deletion ✅

**Documents & Drive Links > add-drive-link.test.ts** → `addDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

134. Valid URL persists ✅
135. Invalid URL rejected ✅

**Documents & Drive Links > remove-drive-link.test.ts** → `deleteDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

136. Owner can remove link ✅
137. Non-owner blocked ✅

### client/__tests__/education-hierarchy.test.ts (8)


**applyEducationAutoSelect** → `applyEducationAutoSelect, EDUCATION_LEVELS — lib/education-hierarchy.ts`

138. selecting the lowest level adds every level (option + all above) ✅
139. selecting the highest level adds only that level ✅
140. selecting a middle level adds that level and every level above it ✅
141. deselecting a level removes that level and every level above it ✅
142. deselecting the lowest level clears every level ✅
143. deduplicates when selecting a level whose ancestors are already present ✅
144. returns the input unchanged when the option is not a known level ✅
145. EDUCATION_LEVELS is ordered low → high ✅

### client/__tests__/emailActionToken.test.ts (10)


**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

146. round-trips a valid token and returns the original inviteId + action ✅
147. round-trips a 'declined' action ✅
148. returns null when verified with a different secret ✅
149. returns null when the signature is tampered with ✅
150. returns null when the payload is mutated but the signature is unchanged ✅
151. returns null for a malformed token with no separator ✅
152. returns null for an empty token ✅

**generateEmailActionToken + verifyEmailActionToken > expiration** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

153. returns null once more than 7 days have passed ✅
154. still verifies 6 days after issuance ✅

**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

155. returns the inviteId that was signed (not some other one) ✅

### client/__tests__/filter-utils.test.ts (22)


**applyCaseFilters** → `applyCaseFilters — lib/filter-utils.ts`

156. translates age range to date_of_birth gte/lte date strings ✅
157. applies gender as an IN clause ✅
158. applies location.state as an IN clause ✅
159. applies education_level as an IN clause ✅
160. applies race as an IN clause ✅
161. applies political_affiliation as an IN clause ✅
162. applies each explicit eligibility field as an EQ clause ✅
163. ignores eligibility values of 'Any' ✅
164. applies socioeconomic and availability mapping ✅
165. applies no filters when the input is empty ✅

**combineCaseFilters** → `combineCaseFilters — lib/filter-utils.ts`

166. returns undefined for an eligibility field where cases conflict (Yes + No) ✅
167. preserves an eligibility field where cases agree (Yes + Yes) ✅
168. unions state arrays across cases ✅
169. collects age ranges from each case into ageRanges ✅

**relaxFilters** → `relaxFilters — lib/filter-utils.ts`

170. level 0 keeps everything ✅
171. level 1 drops the lowest-priority filter (location) ✅
172. level 2 also drops age ✅
173. level 6 still keeps political_affiliation (it is last in priority) ✅
174. level beyond the priority list drops political_affiliation too ✅

**sortParticipantsByMultiCaseMatch** → `sortParticipantsByMultiCaseMatch — lib/filter-utils.ts`

175. breaks ties on eligible_after_at ascending, oldest cooldown first ✅
176. ranks NULL / empty / missing eligible_after_at above any timestamp ✅
177. still ranks case pass count and score above the cooldown tie-break ✅

### client/__tests__/match-participant-to-filter.test.ts (4)


**matchParticipantToFilter** → `(none — function does not exist yet; it.todo placeholders)`

178. Successful match 📝 todo
179. Mismatch case 📝 todo
180. Multi-value AND logic 📝 todo
181. Optional filters ignored 📝 todo

### client/__tests__/participants.test.ts (6)


**Participants > create-profile.test.ts** → `(none — it.todo placeholders)`

182. Happy path 📝 todo
183. Missing required demographic 📝 todo
184. Duplicate profile prevention 📝 todo

**Participants > update-profile-self.test.ts** → `(none — it.todo placeholders)`

185. User can update only own profile 📝 todo

**Participants > update-profile-admin.test.ts** → `(none — it.todo placeholders)`

186. Admin can update any profile 📝 todo
187. Non-admin blocked 📝 todo

### client/__tests__/rls.test.ts (18)


**RLS (Row Level Security) > rls-roles.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

188. Roles immutable ✅
189. No self-promotion ✅

**RLS (Row Level Security) > rls-cases.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

190. Requestee sees own cases only ✅
191. Participant sees none ✅
192. Admin sees all ✅

**RLS (Row Level Security) > rls-case-documents.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

193. Same access partitioning as cases ✅

**RLS (Row Level Security) > rls-session-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

194. Participants see only their own invites ✅

**RLS (Row Level Security) > rls-jury-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

195. Participant sees own row ✅
196. Admin sees all ✅
197. Requestee gets filter-projected view only ✅

**RLS (Row Level Security) > rls-storage-objects.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

198. Participant reads only their OWN driver license ✅
199. Participant cannot read case documents ✅
200. Admin reads any license and any case document ✅
201. Requestee reads/deletes only their OWN case documents ✅
202. Owner may overwrite/delete own file; non-owner non-admin cannot ✅
203. Admin can overwrite an existing participant license (policy #4) but not a case doc ✅
204. INSERT is owner-scoped: the caller becomes the owner ✅
205. service_role bypasses storage RLS (video upload script) ✅

### client/__tests__/roster-order.test.ts (14)


**rosterGroup** → `rosterGroup — lib/participant/rosterOrder.ts`

206. buckets each invite status ✅
207. treats the legacy 'rejected' spelling as declined ✅
208. reads null and unknown statuses as pending ✅
209. lets a strike outrank the status it was applied to ✅

**rosterStatusLabel** → `rosterStatusLabel — lib/participant/rosterOrder.ts`

210. labels every group ✅

**sortRoster** → `sortRoster, compareRosterEntries — lib/participant/rosterOrder.ts`

211. orders accepted → waitlisted → declined → pending → struck ✅
212. matches the declared group order ✅
213. keeps the reserve out of the seated group ✅
214. lets a strike outrank a waitlist slot ✅
215. sorts alphabetically inside a group, not across groups ✅
216. sorts on the displayed 'First Last' string ✅
217. does not mutate the input array ✅
218. keeps equal entries stable ✅
219. handles an empty roster ✅

### client/__tests__/session-start.test.ts (20)


**sessionStartInstant** → `sessionStartInstant — lib/participant/sessionStart.ts`

220. anchors to the earliest case start time, not the first row ✅
221. accepts HH:MM as well as HH:MM:SS ✅
222. tolerates a full timestamp in the date column ✅
223. falls back to midnight UTC when the session has no case times ✅
224. returns null when there is no usable date ✅
225. ignores unparseable times rather than throwing ✅

**hasSessionStarted** → `hasSessionStarted — lib/participant/sessionStart.ts`

226. is false a minute before the first case begins ✅
227. is true exactly at the first case start ✅
228. stays true while the session runs and after it ends ✅
229. is false earlier the same day ✅
230. does not block when the date cannot be read ✅

**sessionEndInstant** → `sessionEndInstant — lib/participant/sessionStart.ts`

231. takes the latest case end ✅
232. rolls an end past midnight onto the next day ✅
233. falls back to the start when there are no end times ✅
234. returns null when the date cannot be read ✅

**cooldownAfterSession** → `cooldownAfterSession — lib/participant/sessionStart.ts`

235. is the day after the session ends, in UTC ✅
236. counts from the real end of a session that runs past midnight ✅
237. crosses a month boundary without drifting ✅
238. crosses a year boundary ✅
239. returns null when the session times cannot be read, so the cooldown is left alone ✅

### client/__tests__/sessions.test.ts (60)


**Sessions > create-session.test.ts** → `createSession — lib/actions/session.ts`

240. Inserts row with admin as created_by ✅
241. Non-admin blocked ✅

**Sessions > add-cases-to-session.test.ts** → `addCasesToSession — lib/actions/session.ts (+ localToUTCTime)`

242. Creates one row per case ✅
243. Correct UTC time conversion ✅
244. Updates each case's admin_scheduled_at ✅
245. Attaching all-offline cases is fine ✅
246. Refuses a selection that mixes in-person and online cases ✅
247. Refuses an online case joining a session that already holds in-person ones ✅
248. An in-person case may join a session that already holds in-person ones ✅

**Sessions > replace-case-in-session.test.ts** → `replaceCaseInSession — lib/actions/session.ts`

249. Swaps in a case of the same format ✅
250. Refuses a replacement of the other format ✅
251. Refuses to flip the format of a session by replacing its ONLY case ✅

**Sessions > invite-participants.test.ts** → `inviteParticipants — lib/actions/session.ts`

252. One pending row per invitee ✅
253. Never exceeds number_of_attendees ✅
254. Sends one email per invitee ✅
255. An online invite quotes $30/hr, says Zoom, and mentions the waitlist ✅
256. An in-person invite quotes $40/hr and the in-person waitlist terms ✅
257. Drops blacklisted invitees (roles + blacklisted_at) and only invites the rest ✅
258. Inserts nothing when every invitee is blacklisted ✅
259. One FK-rejected participant does not block the rest of the batch ✅
260. Never inserts a participant who has no login account ✅
261. Inserts nothing when no selected participant has a login account ✅
262. Resolves the invite email from jury_participants, not the auth admin API ✅
263. Reports the all-skipped case as a failure, not a silent success ✅
264. Drops invitees who are not active panel members ✅
265. Inserts nothing when no invitee is an active panel member ✅

**Sessions > update-invite-status.test.ts** → `updateInviteStatus — lib/participant/updateInviteStatus.ts`

266. pending → accepted ✅
267. pending → declined ✅
268. Session full blocked ✅
269. Incomplete profile blocked ✅
270. Non-active participant blocked from accepting ✅
271. Active status is checked before the profile gate ✅
272. Accepting is blocked once the session has started ✅
273. Accepting once the seats are gone ASKS first and writes nothing ✅
274. Confirming the offer writes the reserve slot ✅
275. Turning down the offer declines, and records that it was the waitlist ✅
276. A plain decline records no waitlist reason but still clears the money ✅
277. Takes the second waitlist slot when one is already filled ✅
278. A seat records the hourly payout for the session length ✅
279. A seat on an in-person session is paid the in-person rate ✅
280. A full in-person session offers a waitlist slot on IN-PERSON terms ✅
281. An in-person waitlist accept records the $30 waiting fee, not $10 ✅
282. The same session online WOULD offer a waitlist slot ✅
283. Declining still works after the session has started ✅
284. A non-active participant can still decline ✅
285. Double response blocked ✅

**Sessions > recordBackoutStrike** → `recordBackoutStrike — lib/actions/participantFlags.ts`

286. stamps struck_at on the session invite row ✅
287. records struck_by when the acting admin is known ✅
288. is idempotent per session — an already-struck invite is a no-op ✅
289. no-ops when the participant has no invite for that session ✅
290. increments flag_count and does NOT blacklist below the limit ✅
291. auto-blacklists when the third flag is reached ✅
292. records the session strike but counts no flag for a legacy (oldData) id ✅

**Sessions > reschedule-session.test.ts** → `rescheduleSession — lib/actions/session.ts`

293. Reprices seats to the new session length ✅
294. Uses the session's own rate, so an in-person seat reprices at $40/hr ✅
295. Targets only seated rows, never a waitlister's flat fee ✅
296. Never originates money on a pre-backfill null payout ✅
297. Refuses to write $0 when the times come back unreadable ✅
298. Leaves a past-dated session's payouts alone ✅
299. Moves the cooldown with the session ✅

### client/__tests__/timezone.test.ts (10)


**localToUTC** → `localToUTC — lib/timezone.ts`

300. returns the same instant when the timezone is UTC ✅
301. adds 5h for America/New_York during standard time (January) ✅
302. adds 4h for America/New_York during DST (July) ✅
303. subtracts 5:30 for Asia/Kolkata (non-whole-hour offset) ✅
304. handles a date inside the spring-forward window without throwing ✅
305. handles a date inside the fall-back ambiguous window without throwing ✅
306. throws for an invalid IANA zone string ✅

**localToUTCTime** → `localToUTCTime — lib/timezone.ts`

307. returns the HH:MM:SS portion of the UTC instant ✅
308. returns the DST-adjusted time in July ✅
309. returns 04:30:00 for 10:00 Asia/Kolkata ✅

### client/__tests__/waitlist.test.ts (16)


**assignSlot** → `assignSlot — lib/participant/waitlist.ts`

310. gives a seat while seats remain ✅
311. starts the waitlist exactly at the cap ✅
312. refuses only once both the seats and the waitlist are gone ✅
313. still offers a seat when a called-in waitlister pushed the count past the cap ✅
314. honours a per-session waitlist cap of zero ✅

**sessionLengthHours** → `sessionLengthHours — lib/participant/waitlist.ts`

315. spans the earliest start to the latest end across every case ✅
316. measures a single case ✅
317. handles a half-hour session ✅
318. treats an end before the start as running past midnight ✅
319. returns 0 when times are missing or unparseable ✅

**payouts** → `seatPayoutCents, waitlistPayoutCents, formatCents — lib/participant/waitlist.ts`

320. pays a seat the hourly rate for the session length ✅
321. rounds a fractional session to whole cents ✅
322. pays a called-in waitlister the FULL session, not the remainder ✅
323. pays a waited-out waitlister the flat fee regardless of session length ✅
324. renders a missing amount as a dash rather than $0.00 ✅

**isWaitlisted** → `isWaitlisted — lib/participant/waitlist.ts`

325. matches only the waitlisted status ✅

