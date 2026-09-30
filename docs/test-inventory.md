# Test inventory

Generated 2026-09-29 from `vitest run`: **338 tests** — 328 passed, 0 failed, 10 todo.

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

### client/__tests__/age-gate.test.ts (16)


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

**isUnderage** → `isUnderage — lib/age-gate.ts`

13. is true one day short of 18 and for a child under 13 ✅
14. is false for someone who turns 18 today ✅
15. is false for missing, malformed, future and implausible dates ✅

**todayIso** → `todayIso — lib/age-gate.ts`

16. formats the local date zero-padded for a date input's max ✅

### client/__tests__/api-route-handlers.test.ts (22)


**API Route Handlers > zip-lookup.test.ts** → `GET — app/api/zip-lookup/route.ts`

17. Valid ZIP code ✅
18. Invalid ZIP format ✅
19. Upstream timeout handling ✅
20. County lookup failure ✅

**API Route Handlers > convert-heic.test.ts** → `POST — app/api/convert-heic/route.ts`

21. Valid HEIC conversion ✅
22. Reject non-HEIC files ✅
23. Oversized payload rejection ✅
24. Non-form-data body is a 400, not a 500 ✅
25. Missing file field is a 400 ✅
26. Text value in the file field is a 400 ✅

**API Route Handlers > email-action.test.ts** → `GET — app/api/email-action/route.ts (+ generateEmailActionToken)`

27. Accept action success ✅
28. Decline action success ✅
29. Expired token ✅
30. Tampered signature ✅
31. Already responded ✅
32. Session full ✅
33. Accepted onto the waitlist ✅
34. Session already started ✅
35. Incomplete profile ✅

**API Route Handlers > auth-confirm.test.ts** → `GET — app/auth/confirm/route.ts`

36. Valid token ✅
37. Expired token ✅
38. Missing token ✅

### client/__tests__/authentication.test.ts (20)


**Authentication > signup-with-custom-email.test.ts** → `signupWithCustomEmail — app/auth/actions.ts`

39. Participant role signup ✅
40. Requestee role signup ✅
41. Duplicate email handling ✅
42. Missing role parameter ✅
43. Admin role is rejected (no self-service privilege escalation) ✅
44. Under-18 date of birth is rejected before any account is created ✅
45. Missing or malformed date of birth is rejected (server action called directly) ✅
46. Date of birth is checked but not stored on the auth user ✅

**Authentication > reset-password-with-custom-email.test.ts** → `resetPasswordWithCustomEmail — app/auth/actions.ts`

47. Known email ✅
48. Unknown email (no information leakage) ✅

**Authentication > update-password.test.ts** → `(none — mocked Supabase client + inline validator)`

49. Valid recovery session ✅
50. Expired session ✅
51. Mismatched password confirmation ✅

**Authentication > middleware.test.ts** → `updateSession — lib/supabase/proxy.ts`

52. Unauthenticated redirect ✅
53. Authenticated pass-through ✅
54. Role-based redirect on /dashboard ✅
55. Public legal pages are reachable logged out ✅
56. Public allowlist matches on a path boundary, not a prefix ✅

**Authentication > confidentiality-gate.test.ts** → `(none — inline checkGate() mirror of app/dashboard/page.tsx)`

57. Requestee blocked without agreement ✅
58. Access allowed with agreement ✅

### client/__tests__/case-lineage.test.ts (13)


**case-lineage involvement classification** → `getLineageParticipantInvolvement, getLineageParticipantIds, isLineageBlocking — lib/case-lineage.ts`

59. blocks someone who accepted a case in the chain ✅
60. frees someone who accepted but was struck — they never sat on the case ✅
61. frees someone who declined ✅
62. treats a 'rejected' status the same as declined ✅
63. frees an unanswered invite once its session is in the past ✅
64. blocks an unanswered invite while its session is still upcoming ✅
65. counts a session dated today as upcoming, not past ✅
66. lets the blocking involvement win when someone appears twice in the chain ✅
67. frees a waitlister who was never called into the meeting ✅
68. blocks a waitlister who WAS called in, because the call-in makes them accepted ✅
69. returns nothing for a case with no sessions ✅

**splitLineageInvolvement** → `splitLineageInvolvement, isLineageBlocking — lib/case-lineage.ts`

70. separates blocking ids from history worth showing ✅
71. agrees with isLineageBlocking ✅

### client/__tests__/cases.test.ts (22)


**Cases > create-case.test.ts** → `(none — inline createCase() mirror in the test)`

72. Happy path ✅
73. Missing required field ✅
74. Non-requestee blocked ✅
75. Oversized files rejected ✅

**Cases > approve-case.test.ts** → `approveCaseAction — lib/actions/adminCase.ts`

76. Updates admin_status ✅
77. Sends approval email ✅
78. Non-admin blocked ✅

**Cases > reject-case.test.ts** → `rejectCaseAction — lib/actions/adminCase.ts`

79. Updates status ✅
80. Records rejection_reason ✅
81. Sends rejection email ✅
82. Non-admin blocked ✅

**Cases > archive-case.test.ts** → `(none — inline archiveCase() mirror of requestee dashboard action)`

83. Requestee archives own case ✅
84. Admin archives any case ✅
85. Requestee blocked from archiving others' cases ✅

**Cases > restore-case.test.ts** → `(none — inline restoreCase() mirror)`

86. Admin restore success ✅
87. Requestee blocked ✅

**Cases > update-case-filters.test.ts** → `updateCaseFilters — app/dashboard/requestee/actions/updateCaseFilters.ts; applyEducationAutoSelect — lib/education-hierarchy.ts`

88. Filter JSON persisted ✅
89. Education hierarchy auto-fill respected ✅

**Cases > confirm-schedule.test.ts** → `(none — inline respondToSchedule() mirror)`

90. pending → accepted ✅
91. Admin reschedule resets status ✅

**Cases > propose-schedule.test.ts** → `(none — inline mirror of Admin/page.tsx action)`

92. Sets admin_scheduled_at ✅
93. Resets schedule_status when schedule changes ✅

### client/__tests__/delivery-mode.test.ts (37)


**normalizeDeliveryMode** → `normalizeDeliveryMode — lib/case/deliveryMode.ts`

94. passes through the two real values ✅
95. degrades anything unrecognised to online, never to the in-person rate ✅

**isOffline / deliveryModeLabel** → `isOffline, deliveryModeLabel — lib/case/deliveryMode.ts`

96. reads the mode the same way normalize does ✅
97. labels for humans ✅

**sessionDeliveryMode** → `sessionDeliveryMode, sessionDeliveryModeOrDefault — lib/case/deliveryMode.ts`

98. is null for a session with no cases — there is nothing to derive from ✅
99. returns the shared mode ✅
100. treats a null case mode as online rather than as a disagreement ✅
101. throws on a mixed session instead of guessing a rate ✅
102. has a non-throwing twin for read-only surfaces ✅

**assertCasesShareDeliveryMode** → `assertCasesShareDeliveryMode — lib/case/deliveryMode.ts`

103. accepts an all-online or all-offline set ✅
104. accepts an empty set — attaching nothing conflicts with nothing ✅
105. rejects a mix within the incoming cases ✅
106. rejects an incoming case that clashes with what is already attached ✅
107. accepts an incoming case matching what is already attached ✅

**requestee pricing** → `baseRatePerHourCents, calculateReceiptPrice, formatCents — lib/receipt-pricing.ts`

108. charges $850/hr online and $1,500/hr in person ✅
109. defaults to the online rate when no mode is passed ✅
110. keeps the $100 filter add-ons on top of the in-person rate ✅
111. reports the rate it used so the receipt can show it ✅

**participant payout** → `hourlyRateCents, seatPayoutCents, waitlistPayoutCents — lib/participant/waitlist.ts`

112. pays $30/hr online and $40/hr in person ✅
113. defaults to the online rate when no mode is passed ✅
114. scales the seat payout by session length ✅
115. pays a called-in waitlister at the session's rate ✅
116. pays the waiting fee at the session's own flat rate ✅

**waitlist terms** → `waitlistCapFor, waitlistHoldMinutes, waitlistWaitFeeCents — lib/participant/waitlist.ts`

117. offers the same number of slots in both formats ✅
118. holds an in-person waitlister twice as long ✅
119. pays an in-person waitlister three times the waiting fee ✅

**county name matching** → `normalizeCountyName, countyMatches, countyQueryForms — lib/filter-utils.ts`

120. treats the stored and picker spellings as the same county ✅
121. keeps multi-word counties intact ✅
122. does not confuse Harris with Harrison ✅
123. an empty filter matches everyone; an empty value matches nothing ✅
124. queries both stored spellings, never a prefix wildcard ✅

**in-person catchment** → `OFFLINE_CATCHMENT_COUNTIES — lib/constants/offline-catchment.ts; withCountyRestriction, relaxFilters — lib/filter-utils.ts`

125. is the six counties around the venue ✅
126. matches participants however their county is spelled ✅
127. excludes the counties the panel actually lives in ✅
128. is NOT expressed as a location filter, so relaxation cannot drop it ✅
129. an in-person case no longer forces its own county into the filters ✅
130. still honours an explicit 'participants from my county' request ✅

### client/__tests__/documents-drive-links.test.ts (10)


**Documents & Drive Links > upload-case-document.test.ts** → `uploadCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

131. Correct storage path ✅
132. case_documents row created ✅
133. Requestee-only access ✅
134. File-name attestation required ✅

**Documents & Drive Links > delete-case-document.test.ts** → `deleteCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

135. Removes file and database row ✅
136. Owner-only deletion ✅

**Documents & Drive Links > add-drive-link.test.ts** → `addDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

137. Valid URL persists ✅
138. Invalid URL rejected ✅

**Documents & Drive Links > remove-drive-link.test.ts** → `deleteDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

139. Owner can remove link ✅
140. Non-owner blocked ✅

### client/__tests__/education-hierarchy.test.ts (8)


**applyEducationAutoSelect** → `applyEducationAutoSelect, EDUCATION_LEVELS — lib/education-hierarchy.ts`

141. selecting the lowest level adds every level (option + all above) ✅
142. selecting the highest level adds only that level ✅
143. selecting a middle level adds that level and every level above it ✅
144. deselecting a level removes that level and every level above it ✅
145. deselecting the lowest level clears every level ✅
146. deduplicates when selecting a level whose ancestors are already present ✅
147. returns the input unchanged when the option is not a known level ✅
148. EDUCATION_LEVELS is ordered low → high ✅

### client/__tests__/emailActionToken.test.ts (10)


**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

149. round-trips a valid token and returns the original inviteId + action ✅
150. round-trips a 'declined' action ✅
151. returns null when verified with a different secret ✅
152. returns null when the signature is tampered with ✅
153. returns null when the payload is mutated but the signature is unchanged ✅
154. returns null for a malformed token with no separator ✅
155. returns null for an empty token ✅

**generateEmailActionToken + verifyEmailActionToken > expiration** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

156. returns null once more than 7 days have passed ✅
157. still verifies 6 days after issuance ✅

**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

158. returns the inviteId that was signed (not some other one) ✅

### client/__tests__/filter-utils.test.ts (22)


**applyCaseFilters** → `applyCaseFilters — lib/filter-utils.ts`

159. translates age range to date_of_birth gte/lte date strings ✅
160. applies gender as an IN clause ✅
161. applies location.state as an IN clause ✅
162. applies education_level as an IN clause ✅
163. applies race as an IN clause ✅
164. applies political_affiliation as an IN clause ✅
165. applies each explicit eligibility field as an EQ clause ✅
166. ignores eligibility values of 'Any' ✅
167. applies socioeconomic and availability mapping ✅
168. applies no filters when the input is empty ✅

**combineCaseFilters** → `combineCaseFilters — lib/filter-utils.ts`

169. returns undefined for an eligibility field where cases conflict (Yes + No) ✅
170. preserves an eligibility field where cases agree (Yes + Yes) ✅
171. unions state arrays across cases ✅
172. collects age ranges from each case into ageRanges ✅

**relaxFilters** → `relaxFilters — lib/filter-utils.ts`

173. level 0 keeps everything ✅
174. level 1 drops the lowest-priority filter (location) ✅
175. level 2 also drops age ✅
176. level 6 still keeps political_affiliation (it is last in priority) ✅
177. level beyond the priority list drops political_affiliation too ✅

**sortParticipantsByMultiCaseMatch** → `sortParticipantsByMultiCaseMatch — lib/filter-utils.ts`

178. breaks ties on eligible_after_at ascending, oldest cooldown first ✅
179. ranks NULL / empty / missing eligible_after_at above any timestamp ✅
180. still ranks case pass count and score above the cooldown tie-break ✅

### client/__tests__/match-participant-to-filter.test.ts (4)


**matchParticipantToFilter** → `(none — function does not exist yet; it.todo placeholders)`

181. Successful match 📝 todo
182. Mismatch case 📝 todo
183. Multi-value AND logic 📝 todo
184. Optional filters ignored 📝 todo

### client/__tests__/participants.test.ts (6)


**Participants > create-profile.test.ts** → `(none — it.todo placeholders)`

185. Happy path 📝 todo
186. Missing required demographic 📝 todo
187. Duplicate profile prevention 📝 todo

**Participants > update-profile-self.test.ts** → `(none — it.todo placeholders)`

188. User can update only own profile 📝 todo

**Participants > update-profile-admin.test.ts** → `(none — it.todo placeholders)`

189. Admin can update any profile 📝 todo
190. Non-admin blocked 📝 todo

### client/__tests__/rls.test.ts (18)


**RLS (Row Level Security) > rls-roles.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

191. Roles immutable ✅
192. No self-promotion ✅

**RLS (Row Level Security) > rls-cases.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

193. Requestee sees own cases only ✅
194. Participant sees none ✅
195. Admin sees all ✅

**RLS (Row Level Security) > rls-case-documents.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

196. Same access partitioning as cases ✅

**RLS (Row Level Security) > rls-session-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

197. Participants see only their own invites ✅

**RLS (Row Level Security) > rls-jury-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

198. Participant sees own row ✅
199. Admin sees all ✅
200. Requestee gets filter-projected view only ✅

**RLS (Row Level Security) > rls-storage-objects.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

201. Participant reads only their OWN driver license ✅
202. Participant cannot read case documents ✅
203. Admin reads any license and any case document ✅
204. Requestee reads/deletes only their OWN case documents ✅
205. Owner may overwrite/delete own file; non-owner non-admin cannot ✅
206. Admin can overwrite an existing participant license (policy #4) but not a case doc ✅
207. INSERT is owner-scoped: the caller becomes the owner ✅
208. service_role bypasses storage RLS (video upload script) ✅

### client/__tests__/roster-order.test.ts (14)


**rosterGroup** → `rosterGroup — lib/participant/rosterOrder.ts`

209. buckets each invite status ✅
210. treats the legacy 'rejected' spelling as declined ✅
211. reads null and unknown statuses as pending ✅
212. lets a strike outrank the status it was applied to ✅

**rosterStatusLabel** → `rosterStatusLabel — lib/participant/rosterOrder.ts`

213. labels every group ✅

**sortRoster** → `sortRoster, compareRosterEntries — lib/participant/rosterOrder.ts`

214. orders accepted → waitlisted → declined → pending → struck ✅
215. matches the declared group order ✅
216. keeps the reserve out of the seated group ✅
217. lets a strike outrank a waitlist slot ✅
218. sorts alphabetically inside a group, not across groups ✅
219. sorts on the displayed 'First Last' string ✅
220. does not mutate the input array ✅
221. keeps equal entries stable ✅
222. handles an empty roster ✅

### client/__tests__/session-start.test.ts (20)


**sessionStartInstant** → `sessionStartInstant — lib/participant/sessionStart.ts`

223. anchors to the earliest case start time, not the first row ✅
224. accepts HH:MM as well as HH:MM:SS ✅
225. tolerates a full timestamp in the date column ✅
226. falls back to midnight UTC when the session has no case times ✅
227. returns null when there is no usable date ✅
228. ignores unparseable times rather than throwing ✅

**hasSessionStarted** → `hasSessionStarted — lib/participant/sessionStart.ts`

229. is false a minute before the first case begins ✅
230. is true exactly at the first case start ✅
231. stays true while the session runs and after it ends ✅
232. is false earlier the same day ✅
233. does not block when the date cannot be read ✅

**sessionEndInstant** → `sessionEndInstant — lib/participant/sessionStart.ts`

234. takes the latest case end ✅
235. rolls an end past midnight onto the next day ✅
236. falls back to the start when there are no end times ✅
237. returns null when the date cannot be read ✅

**cooldownAfterSession** → `cooldownAfterSession — lib/participant/sessionStart.ts`

238. is the day after the session ends, in UTC ✅
239. counts from the real end of a session that runs past midnight ✅
240. crosses a month boundary without drifting ✅
241. crosses a year boundary ✅
242. returns null when the session times cannot be read, so the cooldown is left alone ✅

### client/__tests__/sessions.test.ts (60)


**Sessions > create-session.test.ts** → `createSession — lib/actions/session.ts`

243. Inserts row with admin as created_by ✅
244. Non-admin blocked ✅

**Sessions > add-cases-to-session.test.ts** → `addCasesToSession — lib/actions/session.ts (+ localToUTCTime)`

245. Creates one row per case ✅
246. Correct UTC time conversion ✅
247. Updates each case's admin_scheduled_at ✅
248. Attaching all-offline cases is fine ✅
249. Refuses a selection that mixes in-person and online cases ✅
250. Refuses an online case joining a session that already holds in-person ones ✅
251. An in-person case may join a session that already holds in-person ones ✅

**Sessions > replace-case-in-session.test.ts** → `replaceCaseInSession — lib/actions/session.ts`

252. Swaps in a case of the same format ✅
253. Refuses a replacement of the other format ✅
254. Refuses to flip the format of a session by replacing its ONLY case ✅

**Sessions > invite-participants.test.ts** → `inviteParticipants — lib/actions/session.ts`

255. One pending row per invitee ✅
256. Never exceeds number_of_attendees ✅
257. Sends one email per invitee ✅
258. An online invite quotes $30/hr, says Zoom, and mentions the waitlist ✅
259. An in-person invite quotes $40/hr and the in-person waitlist terms ✅
260. Drops blacklisted invitees (roles + blacklisted_at) and only invites the rest ✅
261. Inserts nothing when every invitee is blacklisted ✅
262. One FK-rejected participant does not block the rest of the batch ✅
263. Never inserts a participant who has no login account ✅
264. Inserts nothing when no selected participant has a login account ✅
265. Resolves the invite email from jury_participants, not the auth admin API ✅
266. Reports the all-skipped case as a failure, not a silent success ✅
267. Drops invitees who are not active panel members ✅
268. Inserts nothing when no invitee is an active panel member ✅

**Sessions > update-invite-status.test.ts** → `updateInviteStatus — lib/participant/updateInviteStatus.ts`

269. pending → accepted ✅
270. pending → declined ✅
271. Session full blocked ✅
272. Incomplete profile blocked ✅
273. Non-active participant blocked from accepting ✅
274. Active status is checked before the profile gate ✅
275. Accepting is blocked once the session has started ✅
276. Accepting once the seats are gone ASKS first and writes nothing ✅
277. Confirming the offer writes the reserve slot ✅
278. Turning down the offer declines, and records that it was the waitlist ✅
279. A plain decline records no waitlist reason but still clears the money ✅
280. Takes the second waitlist slot when one is already filled ✅
281. A seat records the hourly payout for the session length ✅
282. A seat on an in-person session is paid the in-person rate ✅
283. A full in-person session offers a waitlist slot on IN-PERSON terms ✅
284. An in-person waitlist accept records the $30 waiting fee, not $10 ✅
285. The same session online WOULD offer a waitlist slot ✅
286. Declining still works after the session has started ✅
287. A non-active participant can still decline ✅
288. Double response blocked ✅

**Sessions > recordBackoutStrike** → `recordBackoutStrike — lib/actions/participantFlags.ts`

289. stamps struck_at on the session invite row ✅
290. records struck_by when the acting admin is known ✅
291. is idempotent per session — an already-struck invite is a no-op ✅
292. no-ops when the participant has no invite for that session ✅
293. increments flag_count and does NOT blacklist below the limit ✅
294. auto-blacklists when the third flag is reached ✅
295. records the session strike but counts no flag for a legacy (oldData) id ✅

**Sessions > reschedule-session.test.ts** → `rescheduleSession — lib/actions/session.ts`

296. Reprices seats to the new session length ✅
297. Uses the session's own rate, so an in-person seat reprices at $40/hr ✅
298. Targets only seated rows, never a waitlister's flat fee ✅
299. Never originates money on a pre-backfill null payout ✅
300. Refuses to write $0 when the times come back unreadable ✅
301. Leaves a past-dated session's payouts alone ✅
302. Moves the cooldown with the session ✅

### client/__tests__/timezone.test.ts (10)


**localToUTC** → `localToUTC — lib/timezone.ts`

303. returns the same instant when the timezone is UTC ✅
304. adds 5h for America/New_York during standard time (January) ✅
305. adds 4h for America/New_York during DST (July) ✅
306. subtracts 5:30 for Asia/Kolkata (non-whole-hour offset) ✅
307. handles a date inside the spring-forward window without throwing ✅
308. handles a date inside the fall-back ambiguous window without throwing ✅
309. throws for an invalid IANA zone string ✅

**localToUTCTime** → `localToUTCTime — lib/timezone.ts`

310. returns the HH:MM:SS portion of the UTC instant ✅
311. returns the DST-adjusted time in July ✅
312. returns 04:30:00 for 10:00 Asia/Kolkata ✅

### client/__tests__/underage-account.test.ts (10)


**deleteAccountIfUnderage** → `deleteAccountIfUnderage — lib/actions/underageAccount.ts`

313. deletes nothing for an adult ✅
314. deletes nothing for a missing, malformed or future date (a form error, not an age) ✅
315. removes the ID images, every row and then the login — all for the caller only ✅
316. also removes an ID image stored outside the user's folder ✅
317. deletes a legacy participant with no roles row, and skips storage when there's nothing in it ✅
318. deletes a blacklisted participant ✅
319. refuses admins and requestees without deleting anything ✅
320. deletes nothing when signed out ✅
321. stops before removing the login when a row can't be deleted, so a retry can finish ✅
322. reports a failed login delete instead of claiming success ✅

### client/__tests__/waitlist.test.ts (16)


**assignSlot** → `assignSlot — lib/participant/waitlist.ts`

323. gives a seat while seats remain ✅
324. starts the waitlist exactly at the cap ✅
325. refuses only once both the seats and the waitlist are gone ✅
326. still offers a seat when a called-in waitlister pushed the count past the cap ✅
327. honours a per-session waitlist cap of zero ✅

**sessionLengthHours** → `sessionLengthHours — lib/participant/waitlist.ts`

328. spans the earliest start to the latest end across every case ✅
329. measures a single case ✅
330. handles a half-hour session ✅
331. treats an end before the start as running past midnight ✅
332. returns 0 when times are missing or unparseable ✅

**payouts** → `seatPayoutCents, waitlistPayoutCents, formatCents — lib/participant/waitlist.ts`

333. pays a seat the hourly rate for the session length ✅
334. rounds a fractional session to whole cents ✅
335. pays a called-in waitlister the FULL session, not the remainder ✅
336. pays a waited-out waitlister the flat fee regardless of session length ✅
337. renders a missing amount as a dash rather than $0.00 ✅

**isWaitlisted** → `isWaitlisted — lib/participant/waitlist.ts`

338. matches only the waitlisted status ✅

