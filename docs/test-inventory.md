# Test inventory

Generated 2026-09-27 from `vitest run`: **305 tests** — 295 passed, 0 failed, 10 todo.

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

### client/__tests__/api-route-handlers.test.ts (19)


**API Route Handlers > zip-lookup.test.ts** → `GET — app/api/zip-lookup/route.ts`

1. Valid ZIP code ✅
2. Invalid ZIP format ✅
3. Upstream timeout handling ✅
4. County lookup failure ✅

**API Route Handlers > convert-heic.test.ts** → `POST — app/api/convert-heic/route.ts`

5. Valid HEIC conversion ✅
6. Reject non-HEIC files ✅
7. Oversized payload rejection ✅

**API Route Handlers > email-action.test.ts** → `GET — app/api/email-action/route.ts (+ generateEmailActionToken)`

8. Accept action success ✅
9. Decline action success ✅
10. Expired token ✅
11. Tampered signature ✅
12. Already responded ✅
13. Session full ✅
14. Accepted onto the waitlist ✅
15. Session already started ✅
16. Incomplete profile ✅

**API Route Handlers > auth-confirm.test.ts** → `GET — app/auth/confirm/route.ts`

17. Valid token ✅
18. Expired token ✅
19. Missing token ✅

### client/__tests__/authentication.test.ts (16)


**Authentication > signup-with-custom-email.test.ts** → `signupWithCustomEmail — app/auth/actions.ts`

20. Participant role signup ✅
21. Requestee role signup ✅
22. Duplicate email handling ✅
23. Missing role parameter ✅

**Authentication > reset-password-with-custom-email.test.ts** → `resetPasswordWithCustomEmail — app/auth/actions.ts`

24. Known email ✅
25. Unknown email (no information leakage) ✅

**Authentication > update-password.test.ts** → `(none — mocked Supabase client + inline validator)`

26. Valid recovery session ✅
27. Expired session ✅
28. Mismatched password confirmation ✅

**Authentication > middleware.test.ts** → `updateSession — lib/supabase/proxy.ts`

29. Unauthenticated redirect ✅
30. Authenticated pass-through ✅
31. Role-based redirect on /dashboard ✅
32. Public legal pages are reachable logged out ✅
33. Public allowlist matches on a path boundary, not a prefix ✅

**Authentication > confidentiality-gate.test.ts** → `(none — inline checkGate() mirror of app/dashboard/page.tsx)`

34. Requestee blocked without agreement ✅
35. Access allowed with agreement ✅

### client/__tests__/case-lineage.test.ts (13)


**case-lineage involvement classification** → `getLineageParticipantInvolvement, getLineageParticipantIds, isLineageBlocking — lib/case-lineage.ts`

36. blocks someone who accepted a case in the chain ✅
37. frees someone who accepted but was struck — they never sat on the case ✅
38. frees someone who declined ✅
39. treats a 'rejected' status the same as declined ✅
40. frees an unanswered invite once its session is in the past ✅
41. blocks an unanswered invite while its session is still upcoming ✅
42. counts a session dated today as upcoming, not past ✅
43. lets the blocking involvement win when someone appears twice in the chain ✅
44. frees a waitlister who was never called into the meeting ✅
45. blocks a waitlister who WAS called in, because the call-in makes them accepted ✅
46. returns nothing for a case with no sessions ✅

**splitLineageInvolvement** → `splitLineageInvolvement, isLineageBlocking — lib/case-lineage.ts`

47. separates blocking ids from history worth showing ✅
48. agrees with isLineageBlocking ✅

### client/__tests__/cases.test.ts (22)


**Cases > create-case.test.ts** → `(none — inline createCase() mirror in the test)`

49. Happy path ✅
50. Missing required field ✅
51. Non-requestee blocked ✅
52. Oversized files rejected ✅

**Cases > approve-case.test.ts** → `approveCaseAction — lib/actions/adminCase.ts`

53. Updates admin_status ✅
54. Sends approval email ✅
55. Non-admin blocked ✅

**Cases > reject-case.test.ts** → `rejectCaseAction — lib/actions/adminCase.ts`

56. Updates status ✅
57. Records rejection_reason ✅
58. Sends rejection email ✅
59. Non-admin blocked ✅

**Cases > archive-case.test.ts** → `(none — inline archiveCase() mirror of requestee dashboard action)`

60. Requestee archives own case ✅
61. Admin archives any case ✅
62. Requestee blocked from archiving others' cases ✅

**Cases > restore-case.test.ts** → `(none — inline restoreCase() mirror)`

63. Admin restore success ✅
64. Requestee blocked ✅

**Cases > update-case-filters.test.ts** → `updateCaseFilters — app/dashboard/requestee/actions/updateCaseFilters.ts; applyEducationAutoSelect — lib/education-hierarchy.ts`

65. Filter JSON persisted ✅
66. Education hierarchy auto-fill respected ✅

**Cases > confirm-schedule.test.ts** → `(none — inline respondToSchedule() mirror)`

67. pending → accepted ✅
68. Admin reschedule resets status ✅

**Cases > propose-schedule.test.ts** → `(none — inline mirror of Admin/page.tsx action)`

69. Sets admin_scheduled_at ✅
70. Resets schedule_status when schedule changes ✅

### client/__tests__/delivery-mode.test.ts (37)


**normalizeDeliveryMode** → `normalizeDeliveryMode — lib/case/deliveryMode.ts`

71. passes through the two real values ✅
72. degrades anything unrecognised to online, never to the in-person rate ✅

**isOffline / deliveryModeLabel** → `isOffline, deliveryModeLabel — lib/case/deliveryMode.ts`

73. reads the mode the same way normalize does ✅
74. labels for humans ✅

**sessionDeliveryMode** → `sessionDeliveryMode, sessionDeliveryModeOrDefault — lib/case/deliveryMode.ts`

75. is null for a session with no cases — there is nothing to derive from ✅
76. returns the shared mode ✅
77. treats a null case mode as online rather than as a disagreement ✅
78. throws on a mixed session instead of guessing a rate ✅
79. has a non-throwing twin for read-only surfaces ✅

**assertCasesShareDeliveryMode** → `assertCasesShareDeliveryMode — lib/case/deliveryMode.ts`

80. accepts an all-online or all-offline set ✅
81. accepts an empty set — attaching nothing conflicts with nothing ✅
82. rejects a mix within the incoming cases ✅
83. rejects an incoming case that clashes with what is already attached ✅
84. accepts an incoming case matching what is already attached ✅

**requestee pricing** → `baseRatePerHourCents, calculateReceiptPrice, formatCents — lib/receipt-pricing.ts`

85. charges $850/hr online and $1,500/hr in person ✅
86. defaults to the online rate when no mode is passed ✅
87. keeps the $100 filter add-ons on top of the in-person rate ✅
88. reports the rate it used so the receipt can show it ✅

**participant payout** → `hourlyRateCents, seatPayoutCents, waitlistPayoutCents — lib/participant/waitlist.ts`

89. pays $30/hr online and $40/hr in person ✅
90. defaults to the online rate when no mode is passed ✅
91. scales the seat payout by session length ✅
92. pays a called-in waitlister at the session's rate ✅
93. pays the waiting fee at the session's own flat rate ✅

**waitlist terms** → `waitlistCapFor, waitlistHoldMinutes, waitlistWaitFeeCents — lib/participant/waitlist.ts`

94. offers the same number of slots in both formats ✅
95. holds an in-person waitlister twice as long ✅
96. pays an in-person waitlister three times the waiting fee ✅

**county name matching** → `normalizeCountyName, countyMatches, countyQueryForms — lib/filter-utils.ts`

97. treats the stored and picker spellings as the same county ✅
98. keeps multi-word counties intact ✅
99. does not confuse Harris with Harrison ✅
100. an empty filter matches everyone; an empty value matches nothing ✅
101. queries both stored spellings, never a prefix wildcard ✅

**in-person catchment** → `OFFLINE_CATCHMENT_COUNTIES — lib/constants/offline-catchment.ts; withCountyRestriction, relaxFilters — lib/filter-utils.ts`

102. is the six counties around the venue ✅
103. matches participants however their county is spelled ✅
104. excludes the counties the panel actually lives in ✅
105. is NOT expressed as a location filter, so relaxation cannot drop it ✅
106. an in-person case no longer forces its own county into the filters ✅
107. still honours an explicit 'participants from my county' request ✅

### client/__tests__/documents-drive-links.test.ts (10)


**Documents & Drive Links > upload-case-document.test.ts** → `uploadCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

108. Correct storage path ✅
109. case_documents row created ✅
110. Requestee-only access ✅
111. File-name attestation required ✅

**Documents & Drive Links > delete-case-document.test.ts** → `deleteCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

112. Removes file and database row ✅
113. Owner-only deletion ✅

**Documents & Drive Links > add-drive-link.test.ts** → `addDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

114. Valid URL persists ✅
115. Invalid URL rejected ✅

**Documents & Drive Links > remove-drive-link.test.ts** → `deleteDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

116. Owner can remove link ✅
117. Non-owner blocked ✅

### client/__tests__/education-hierarchy.test.ts (8)


**applyEducationAutoSelect** → `applyEducationAutoSelect, EDUCATION_LEVELS — lib/education-hierarchy.ts`

118. selecting the lowest level adds every level (option + all above) ✅
119. selecting the highest level adds only that level ✅
120. selecting a middle level adds that level and every level above it ✅
121. deselecting a level removes that level and every level above it ✅
122. deselecting the lowest level clears every level ✅
123. deduplicates when selecting a level whose ancestors are already present ✅
124. returns the input unchanged when the option is not a known level ✅
125. EDUCATION_LEVELS is ordered low → high ✅

### client/__tests__/emailActionToken.test.ts (10)


**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

126. round-trips a valid token and returns the original inviteId + action ✅
127. round-trips a 'declined' action ✅
128. returns null when verified with a different secret ✅
129. returns null when the signature is tampered with ✅
130. returns null when the payload is mutated but the signature is unchanged ✅
131. returns null for a malformed token with no separator ✅
132. returns null for an empty token ✅

**generateEmailActionToken + verifyEmailActionToken > expiration** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

133. returns null once more than 7 days have passed ✅
134. still verifies 6 days after issuance ✅

**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

135. returns the inviteId that was signed (not some other one) ✅

### client/__tests__/filter-utils.test.ts (22)


**applyCaseFilters** → `applyCaseFilters — lib/filter-utils.ts`

136. translates age range to date_of_birth gte/lte date strings ✅
137. applies gender as an IN clause ✅
138. applies location.state as an IN clause ✅
139. applies education_level as an IN clause ✅
140. applies race as an IN clause ✅
141. applies political_affiliation as an IN clause ✅
142. applies each explicit eligibility field as an EQ clause ✅
143. ignores eligibility values of 'Any' ✅
144. applies socioeconomic and availability mapping ✅
145. applies no filters when the input is empty ✅

**combineCaseFilters** → `combineCaseFilters — lib/filter-utils.ts`

146. returns undefined for an eligibility field where cases conflict (Yes + No) ✅
147. preserves an eligibility field where cases agree (Yes + Yes) ✅
148. unions state arrays across cases ✅
149. collects age ranges from each case into ageRanges ✅

**relaxFilters** → `relaxFilters — lib/filter-utils.ts`

150. level 0 keeps everything ✅
151. level 1 drops the lowest-priority filter (location) ✅
152. level 2 also drops age ✅
153. level 6 still keeps political_affiliation (it is last in priority) ✅
154. level beyond the priority list drops political_affiliation too ✅

**sortParticipantsByMultiCaseMatch** → `sortParticipantsByMultiCaseMatch — lib/filter-utils.ts`

155. breaks ties on eligible_after_at ascending, oldest cooldown first ✅
156. ranks NULL / empty / missing eligible_after_at above any timestamp ✅
157. still ranks case pass count and score above the cooldown tie-break ✅

### client/__tests__/match-participant-to-filter.test.ts (4)


**matchParticipantToFilter** → `(none — function does not exist yet; it.todo placeholders)`

158. Successful match 📝 todo
159. Mismatch case 📝 todo
160. Multi-value AND logic 📝 todo
161. Optional filters ignored 📝 todo

### client/__tests__/participants.test.ts (6)


**Participants > create-profile.test.ts** → `(none — it.todo placeholders)`

162. Happy path 📝 todo
163. Missing required demographic 📝 todo
164. Duplicate profile prevention 📝 todo

**Participants > update-profile-self.test.ts** → `(none — it.todo placeholders)`

165. User can update only own profile 📝 todo

**Participants > update-profile-admin.test.ts** → `(none — it.todo placeholders)`

166. Admin can update any profile 📝 todo
167. Non-admin blocked 📝 todo

### client/__tests__/rls.test.ts (18)


**RLS (Row Level Security) > rls-roles.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

168. Roles immutable ✅
169. No self-promotion ✅

**RLS (Row Level Security) > rls-cases.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

170. Requestee sees own cases only ✅
171. Participant sees none ✅
172. Admin sees all ✅

**RLS (Row Level Security) > rls-case-documents.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

173. Same access partitioning as cases ✅

**RLS (Row Level Security) > rls-session-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

174. Participants see only their own invites ✅

**RLS (Row Level Security) > rls-jury-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

175. Participant sees own row ✅
176. Admin sees all ✅
177. Requestee gets filter-projected view only ✅

**RLS (Row Level Security) > rls-storage-objects.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

178. Participant reads only their OWN driver license ✅
179. Participant cannot read case documents ✅
180. Admin reads any license and any case document ✅
181. Requestee reads/deletes only their OWN case documents ✅
182. Owner may overwrite/delete own file; non-owner non-admin cannot ✅
183. Admin can overwrite an existing participant license (policy #4) but not a case doc ✅
184. INSERT is owner-scoped: the caller becomes the owner ✅
185. service_role bypasses storage RLS (video upload script) ✅

### client/__tests__/roster-order.test.ts (14)


**rosterGroup** → `rosterGroup — lib/participant/rosterOrder.ts`

186. buckets each invite status ✅
187. treats the legacy 'rejected' spelling as declined ✅
188. reads null and unknown statuses as pending ✅
189. lets a strike outrank the status it was applied to ✅

**rosterStatusLabel** → `rosterStatusLabel — lib/participant/rosterOrder.ts`

190. labels every group ✅

**sortRoster** → `sortRoster, compareRosterEntries — lib/participant/rosterOrder.ts`

191. orders accepted → waitlisted → declined → pending → struck ✅
192. matches the declared group order ✅
193. keeps the reserve out of the seated group ✅
194. lets a strike outrank a waitlist slot ✅
195. sorts alphabetically inside a group, not across groups ✅
196. sorts on the displayed 'First Last' string ✅
197. does not mutate the input array ✅
198. keeps equal entries stable ✅
199. handles an empty roster ✅

### client/__tests__/session-start.test.ts (20)


**sessionStartInstant** → `sessionStartInstant — lib/participant/sessionStart.ts`

200. anchors to the earliest case start time, not the first row ✅
201. accepts HH:MM as well as HH:MM:SS ✅
202. tolerates a full timestamp in the date column ✅
203. falls back to midnight UTC when the session has no case times ✅
204. returns null when there is no usable date ✅
205. ignores unparseable times rather than throwing ✅

**hasSessionStarted** → `hasSessionStarted — lib/participant/sessionStart.ts`

206. is false a minute before the first case begins ✅
207. is true exactly at the first case start ✅
208. stays true while the session runs and after it ends ✅
209. is false earlier the same day ✅
210. does not block when the date cannot be read ✅

**sessionEndInstant** → `sessionEndInstant — lib/participant/sessionStart.ts`

211. takes the latest case end ✅
212. rolls an end past midnight onto the next day ✅
213. falls back to the start when there are no end times ✅
214. returns null when the date cannot be read ✅

**cooldownAfterSession** → `cooldownAfterSession — lib/participant/sessionStart.ts`

215. is the day after the session ends, in UTC ✅
216. counts from the real end of a session that runs past midnight ✅
217. crosses a month boundary without drifting ✅
218. crosses a year boundary ✅
219. returns null when the session times cannot be read, so the cooldown is left alone ✅

### client/__tests__/sessions.test.ts (60)


**Sessions > create-session.test.ts** → `createSession — lib/actions/session.ts`

220. Inserts row with admin as created_by ✅
221. Non-admin blocked ✅

**Sessions > add-cases-to-session.test.ts** → `addCasesToSession — lib/actions/session.ts (+ localToUTCTime)`

222. Creates one row per case ✅
223. Correct UTC time conversion ✅
224. Updates each case's admin_scheduled_at ✅
225. Attaching all-offline cases is fine ✅
226. Refuses a selection that mixes in-person and online cases ✅
227. Refuses an online case joining a session that already holds in-person ones ✅
228. An in-person case may join a session that already holds in-person ones ✅

**Sessions > replace-case-in-session.test.ts** → `replaceCaseInSession — lib/actions/session.ts`

229. Swaps in a case of the same format ✅
230. Refuses a replacement of the other format ✅
231. Refuses to flip the format of a session by replacing its ONLY case ✅

**Sessions > invite-participants.test.ts** → `inviteParticipants — lib/actions/session.ts`

232. One pending row per invitee ✅
233. Never exceeds number_of_attendees ✅
234. Sends one email per invitee ✅
235. An online invite quotes $30/hr, says Zoom, and mentions the waitlist ✅
236. An in-person invite quotes $40/hr and the in-person waitlist terms ✅
237. Drops blacklisted invitees (roles + blacklisted_at) and only invites the rest ✅
238. Inserts nothing when every invitee is blacklisted ✅
239. One FK-rejected participant does not block the rest of the batch ✅
240. Never inserts a participant who has no login account ✅
241. Inserts nothing when no selected participant has a login account ✅
242. Resolves the invite email from jury_participants, not the auth admin API ✅
243. Reports the all-skipped case as a failure, not a silent success ✅
244. Drops invitees who are not active panel members ✅
245. Inserts nothing when no invitee is an active panel member ✅

**Sessions > update-invite-status.test.ts** → `updateInviteStatus — lib/participant/updateInviteStatus.ts`

246. pending → accepted ✅
247. pending → declined ✅
248. Session full blocked ✅
249. Incomplete profile blocked ✅
250. Non-active participant blocked from accepting ✅
251. Active status is checked before the profile gate ✅
252. Accepting is blocked once the session has started ✅
253. Accepting once the seats are gone ASKS first and writes nothing ✅
254. Confirming the offer writes the reserve slot ✅
255. Turning down the offer declines, and records that it was the waitlist ✅
256. A plain decline records no waitlist reason but still clears the money ✅
257. Takes the second waitlist slot when one is already filled ✅
258. A seat records the hourly payout for the session length ✅
259. A seat on an in-person session is paid the in-person rate ✅
260. A full in-person session offers a waitlist slot on IN-PERSON terms ✅
261. An in-person waitlist accept records the $30 waiting fee, not $10 ✅
262. The same session online WOULD offer a waitlist slot ✅
263. Declining still works after the session has started ✅
264. A non-active participant can still decline ✅
265. Double response blocked ✅

**Sessions > recordBackoutStrike** → `recordBackoutStrike — lib/actions/participantFlags.ts`

266. stamps struck_at on the session invite row ✅
267. records struck_by when the acting admin is known ✅
268. is idempotent per session — an already-struck invite is a no-op ✅
269. no-ops when the participant has no invite for that session ✅
270. increments flag_count and does NOT blacklist below the limit ✅
271. auto-blacklists when the third flag is reached ✅
272. records the session strike but counts no flag for a legacy (oldData) id ✅

**Sessions > reschedule-session.test.ts** → `rescheduleSession — lib/actions/session.ts`

273. Reprices seats to the new session length ✅
274. Uses the session's own rate, so an in-person seat reprices at $40/hr ✅
275. Targets only seated rows, never a waitlister's flat fee ✅
276. Never originates money on a pre-backfill null payout ✅
277. Refuses to write $0 when the times come back unreadable ✅
278. Leaves a past-dated session's payouts alone ✅
279. Moves the cooldown with the session ✅

### client/__tests__/timezone.test.ts (10)


**localToUTC** → `localToUTC — lib/timezone.ts`

280. returns the same instant when the timezone is UTC ✅
281. adds 5h for America/New_York during standard time (January) ✅
282. adds 4h for America/New_York during DST (July) ✅
283. subtracts 5:30 for Asia/Kolkata (non-whole-hour offset) ✅
284. handles a date inside the spring-forward window without throwing ✅
285. handles a date inside the fall-back ambiguous window without throwing ✅
286. throws for an invalid IANA zone string ✅

**localToUTCTime** → `localToUTCTime — lib/timezone.ts`

287. returns the HH:MM:SS portion of the UTC instant ✅
288. returns the DST-adjusted time in July ✅
289. returns 04:30:00 for 10:00 Asia/Kolkata ✅

### client/__tests__/waitlist.test.ts (16)


**assignSlot** → `assignSlot — lib/participant/waitlist.ts`

290. gives a seat while seats remain ✅
291. starts the waitlist exactly at the cap ✅
292. refuses only once both the seats and the waitlist are gone ✅
293. still offers a seat when a called-in waitlister pushed the count past the cap ✅
294. honours a per-session waitlist cap of zero ✅

**sessionLengthHours** → `sessionLengthHours — lib/participant/waitlist.ts`

295. spans the earliest start to the latest end across every case ✅
296. measures a single case ✅
297. handles a half-hour session ✅
298. treats an end before the start as running past midnight ✅
299. returns 0 when times are missing or unparseable ✅

**payouts** → `seatPayoutCents, waitlistPayoutCents, formatCents — lib/participant/waitlist.ts`

300. pays a seat the hourly rate for the session length ✅
301. rounds a fractional session to whole cents ✅
302. pays a called-in waitlister the FULL session, not the remainder ✅
303. pays a waited-out waitlister the flat fee regardless of session length ✅
304. renders a missing amount as a dash rather than $0.00 ✅

**isWaitlisted** → `isWaitlisted — lib/participant/waitlist.ts`

305. matches only the waitlisted status ✅

