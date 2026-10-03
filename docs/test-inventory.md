# Test inventory

Generated 2026-10-03 from `vitest run`: **375 tests** — 365 passed, 0 failed, 10 todo.

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

### client/__tests__/authentication.test.ts (22)


**Authentication > signup-with-custom-email.test.ts** → `signupWithCustomEmail — app/auth/actions.ts`

39. Participant role signup ✅
40. Requestee role signup ✅
41. Duplicate email handling ✅
42. Missing role parameter ✅
43. Admin role is rejected (no self-service privilege escalation) ✅
44. Under-18 date of birth is rejected before any account is created ✅
45. Missing or malformed date of birth is rejected (server action called directly) ✅
46. Date of birth is checked but not stored on the auth user ✅
47. Confirm link lands on NEXT_PUBLIC_APP_URL, never on a posted origin ✅

**Authentication > reset-password-with-custom-email.test.ts** → `resetPasswordWithCustomEmail — app/auth/actions.ts`

48. Known email ✅
49. Unknown email (no information leakage) ✅
50. Reset link lands on NEXT_PUBLIC_APP_URL, never on a posted origin ✅

**Authentication > update-password.test.ts** → `(none — mocked Supabase client + inline validator)`

51. Valid recovery session ✅
52. Expired session ✅
53. Mismatched password confirmation ✅

**Authentication > middleware.test.ts** → `updateSession — lib/supabase/proxy.ts`

54. Unauthenticated redirect ✅
55. Authenticated pass-through ✅
56. Role-based redirect on /dashboard ✅
57. Public legal pages are reachable logged out ✅
58. Public allowlist matches on a path boundary, not a prefix ✅

**Authentication > confidentiality-gate.test.ts** → `(none — inline checkGate() mirror of app/dashboard/page.tsx)`

59. Requestee blocked without agreement ✅
60. Access allowed with agreement ✅

### client/__tests__/case-lineage.test.ts (13)


**case-lineage involvement classification** → `getLineageParticipantInvolvement, getLineageParticipantIds, isLineageBlocking — lib/case-lineage.ts`

61. blocks someone who accepted a case in the chain ✅
62. frees someone who accepted but was struck — they never sat on the case ✅
63. frees someone who declined ✅
64. treats a 'rejected' status the same as declined ✅
65. frees an unanswered invite once its session is in the past ✅
66. blocks an unanswered invite while its session is still upcoming ✅
67. counts a session dated today as upcoming, not past ✅
68. lets the blocking involvement win when someone appears twice in the chain ✅
69. frees a waitlister who was never called into the meeting ✅
70. blocks a waitlister who WAS called in, because the call-in makes them accepted ✅
71. returns nothing for a case with no sessions ✅

**splitLineageInvolvement** → `splitLineageInvolvement, isLineageBlocking — lib/case-lineage.ts`

72. separates blocking ids from history worth showing ✅
73. agrees with isLineageBlocking ✅

### client/__tests__/cases.test.ts (22)


**Cases > create-case.test.ts** → `(none — inline createCase() mirror in the test)`

74. Happy path ✅
75. Missing required field ✅
76. Non-requestee blocked ✅
77. Oversized files rejected ✅

**Cases > approve-case.test.ts** → `approveCaseAction — lib/actions/adminCase.ts`

78. Updates admin_status ✅
79. Sends approval email ✅
80. Non-admin blocked ✅

**Cases > reject-case.test.ts** → `rejectCaseAction — lib/actions/adminCase.ts`

81. Updates status ✅
82. Records rejection_reason ✅
83. Sends rejection email ✅
84. Non-admin blocked ✅

**Cases > archive-case.test.ts** → `(none — inline archiveCase() mirror of requestee dashboard action)`

85. Requestee archives own case ✅
86. Admin archives any case ✅
87. Requestee blocked from archiving others' cases ✅

**Cases > restore-case.test.ts** → `(none — inline restoreCase() mirror)`

88. Admin restore success ✅
89. Requestee blocked ✅

**Cases > update-case-filters.test.ts** → `updateCaseFilters — app/dashboard/requestee/actions/updateCaseFilters.ts; applyEducationAutoSelect — lib/education-hierarchy.ts`

90. Filter JSON persisted ✅
91. Education hierarchy auto-fill respected ✅

**Cases > confirm-schedule.test.ts** → `(none — inline respondToSchedule() mirror)`

92. pending → accepted ✅
93. Admin reschedule resets status ✅

**Cases > propose-schedule.test.ts** → `(none — inline mirror of Admin/page.tsx action)`

94. Sets admin_scheduled_at ✅
95. Resets schedule_status when schedule changes ✅

### client/__tests__/delivery-mode.test.ts (37)


**normalizeDeliveryMode** → `normalizeDeliveryMode — lib/case/deliveryMode.ts`

96. passes through the two real values ✅
97. degrades anything unrecognised to online, never to the in-person rate ✅

**isOffline / deliveryModeLabel** → `isOffline, deliveryModeLabel — lib/case/deliveryMode.ts`

98. reads the mode the same way normalize does ✅
99. labels for humans ✅

**sessionDeliveryMode** → `sessionDeliveryMode, sessionDeliveryModeOrDefault — lib/case/deliveryMode.ts`

100. is null for a session with no cases — there is nothing to derive from ✅
101. returns the shared mode ✅
102. treats a null case mode as online rather than as a disagreement ✅
103. throws on a mixed session instead of guessing a rate ✅
104. has a non-throwing twin for read-only surfaces ✅

**assertCasesShareDeliveryMode** → `assertCasesShareDeliveryMode — lib/case/deliveryMode.ts`

105. accepts an all-online or all-offline set ✅
106. accepts an empty set — attaching nothing conflicts with nothing ✅
107. rejects a mix within the incoming cases ✅
108. rejects an incoming case that clashes with what is already attached ✅
109. accepts an incoming case matching what is already attached ✅

**requestee pricing** → `baseRatePerHourCents, calculateReceiptPrice, formatCents — lib/receipt-pricing.ts`

110. charges $850/hr online and $1,500/hr in person ✅
111. defaults to the online rate when no mode is passed ✅
112. keeps the $100 filter add-ons on top of the in-person rate ✅
113. reports the rate it used so the receipt can show it ✅

**participant payout** → `hourlyRateCents, seatPayoutCents, waitlistPayoutCents — lib/participant/waitlist.ts`

114. pays $30/hr online and $40/hr in person ✅
115. defaults to the online rate when no mode is passed ✅
116. scales the seat payout by session length ✅
117. pays a called-in waitlister at the session's rate ✅
118. pays the waiting fee at the session's own flat rate ✅

**waitlist terms** → `waitlistCapFor, waitlistHoldMinutes, waitlistWaitFeeCents — lib/participant/waitlist.ts`

119. offers the same number of slots in both formats ✅
120. holds an in-person waitlister twice as long ✅
121. pays an in-person waitlister three times the waiting fee ✅

**county name matching** → `normalizeCountyName, countyMatches, countyQueryForms — lib/filter-utils.ts`

122. treats the stored and picker spellings as the same county ✅
123. keeps multi-word counties intact ✅
124. does not confuse Harris with Harrison ✅
125. an empty filter matches everyone; an empty value matches nothing ✅
126. queries both stored spellings, never a prefix wildcard ✅

**in-person catchment** → `OFFLINE_CATCHMENT_COUNTIES — lib/constants/offline-catchment.ts; withCountyRestriction, relaxFilters — lib/filter-utils.ts`

127. is the six counties around the venue ✅
128. matches participants however their county is spelled ✅
129. excludes the counties the panel actually lives in ✅
130. is NOT expressed as a location filter, so relaxation cannot drop it ✅
131. an in-person case no longer forces its own county into the filters ✅
132. still honours an explicit 'participants from my county' request ✅

### client/__tests__/documents-drive-links.test.ts (10)


**Documents & Drive Links > upload-case-document.test.ts** → `uploadCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

133. Correct storage path ✅
134. case_documents row created ✅
135. Requestee-only access ✅
136. File-name attestation required ✅

**Documents & Drive Links > delete-case-document.test.ts** → `deleteCaseDocument — app/dashboard/requestee/actions/caseDocuments.ts`

137. Removes file and database row ✅
138. Owner-only deletion ✅

**Documents & Drive Links > add-drive-link.test.ts** → `addDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

139. Valid URL persists ✅
140. Invalid URL rejected ✅

**Documents & Drive Links > remove-drive-link.test.ts** → `deleteDriveLink — app/dashboard/requestee/actions/caseDriveLinks.ts`

141. Owner can remove link ✅
142. Non-owner blocked ✅

### client/__tests__/education-hierarchy.test.ts (8)


**applyEducationAutoSelect** → `applyEducationAutoSelect, EDUCATION_LEVELS — lib/education-hierarchy.ts`

143. selecting the lowest level adds every level (option + all above) ✅
144. selecting the highest level adds only that level ✅
145. selecting a middle level adds that level and every level above it ✅
146. deselecting a level removes that level and every level above it ✅
147. deselecting the lowest level clears every level ✅
148. deduplicates when selecting a level whose ancestors are already present ✅
149. returns the input unchanged when the option is not a known level ✅
150. EDUCATION_LEVELS is ordered low → high ✅

### client/__tests__/emailActionToken.test.ts (10)


**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

151. round-trips a valid token and returns the original inviteId + action ✅
152. round-trips a 'declined' action ✅
153. returns null when verified with a different secret ✅
154. returns null when the signature is tampered with ✅
155. returns null when the payload is mutated but the signature is unchanged ✅
156. returns null for a malformed token with no separator ✅
157. returns null for an empty token ✅

**generateEmailActionToken + verifyEmailActionToken > expiration** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

158. returns null once more than 7 days have passed ✅
159. still verifies 6 days after issuance ✅

**generateEmailActionToken + verifyEmailActionToken** → `generateEmailActionToken, verifyEmailActionToken — lib/emailActionToken.ts`

160. returns the inviteId that was signed (not some other one) ✅

### client/__tests__/filter-utils.test.ts (22)


**applyCaseFilters** → `applyCaseFilters — lib/filter-utils.ts`

161. translates age range to date_of_birth gte/lte date strings ✅
162. applies gender as an IN clause ✅
163. applies location.state as an IN clause ✅
164. applies education_level as an IN clause ✅
165. applies race as an IN clause ✅
166. applies political_affiliation as an IN clause ✅
167. applies each explicit eligibility field as an EQ clause ✅
168. ignores eligibility values of 'Any' ✅
169. applies socioeconomic and availability mapping ✅
170. applies no filters when the input is empty ✅

**combineCaseFilters** → `combineCaseFilters — lib/filter-utils.ts`

171. returns undefined for an eligibility field where cases conflict (Yes + No) ✅
172. preserves an eligibility field where cases agree (Yes + Yes) ✅
173. unions state arrays across cases ✅
174. collects age ranges from each case into ageRanges ✅

**relaxFilters** → `relaxFilters — lib/filter-utils.ts`

175. level 0 keeps everything ✅
176. level 1 drops the lowest-priority filter (location) ✅
177. level 2 also drops age ✅
178. level 6 still keeps political_affiliation (it is last in priority) ✅
179. level beyond the priority list drops political_affiliation too ✅

**sortParticipantsByMultiCaseMatch** → `sortParticipantsByMultiCaseMatch — lib/filter-utils.ts`

180. breaks ties on eligible_after_at ascending, oldest cooldown first ✅
181. ranks NULL / empty / missing eligible_after_at above any timestamp ✅
182. still ranks case pass count and score above the cooldown tie-break ✅

### client/__tests__/match-participant-to-filter.test.ts (4)


**matchParticipantToFilter** → `(none — function does not exist yet; it.todo placeholders)`

183. Successful match 📝 todo
184. Mismatch case 📝 todo
185. Multi-value AND logic 📝 todo
186. Optional filters ignored 📝 todo

### client/__tests__/participants.test.ts (6)


**Participants > create-profile.test.ts** → `(none — it.todo placeholders)`

187. Happy path 📝 todo
188. Missing required demographic 📝 todo
189. Duplicate profile prevention 📝 todo

**Participants > update-profile-self.test.ts** → `(none — it.todo placeholders)`

190. User can update only own profile 📝 todo

**Participants > update-profile-admin.test.ts** → `(none — it.todo placeholders)`

191. Admin can update any profile 📝 todo
192. Non-admin blocked 📝 todo

### client/__tests__/reactivation-email.test.ts (16)


**reactivation email (CAN-SPAM) > unsubscribe token** → `generateReactivationToken, verifyReactivationToken — lib/reactivationToken.ts`

193. round-trips the participant and the unsubscribe action ✅
194. keeps working well past the 30 days CAN-SPAM requires ✅
195. leaves the Yes/No links on their 30-day expiry ✅

**reactivation email (CAN-SPAM) > emailWrapper footer** → `emailWrapper — lib/mail.ts`

196. labels campaign email a solicitation and links to unsubscribe ✅
197. adds neither to ordinary transactional email ✅
198. renders the postal address, escaped, once it is set ✅

**reactivation email (CAN-SPAM) > sendReactivationEmails** → `sendReactivationEmails — lib/actions/adminParticipant.ts`

199. still sends while no postal address is set ✅
200. excludes anyone at 'no', whether they answered No or unsubscribed ✅
201. gives every email an unsubscribe link signed for its recipient ✅

**reactivation email (CAN-SPAM) > reactivate route > Unsubscribe** → `GET, POST — app/api/email-action/reactivate/route.ts`

202. opening the link only shows the button and writes nothing ✅
203. the button sets reactivation_status to no, whatever it was ✅
204. names the support address if the write fails ✅
205. the button refuses a token from any other link ✅
206. the button refuses a tampered token ✅

**reactivation email (CAN-SPAM) > reactivate route > No click** → `GET — app/api/email-action/reactivate/route.ts`

207. takes a pending participant off the panel ✅
208. never overwrites an earlier answer ✅

### client/__tests__/requestee-participant-access.test.ts (19)


**requestee participant access > the fields a firm may see** → `toRequesteeProfile, ageOf, toRequesteeSearchResult — lib/participant/requesteeAccess.ts`

209. keeps the profile fields and an age, and drops every private field ✅
210. works out the age from date_of_birth, oldData's dob, or its age column ✅
211. search results carry an age, never the date of birth ✅

**requestee participant access > getCaseParticipantNames** → `getCaseParticipantNames — lib/actions/requesteeParticipant.ts; participantNamesForCases, ownsAllCases — lib/participant/requesteeAccess.ts`

212. returns names only, for people on the firm's own case, with legacy rows from oldData ✅
213. leaves out anyone not on the case, and waitlisters ✅
214. refuses a case the firm doesn't own, before reading any participant table ✅
215. accepts a case the firm is the assigned requestee on ✅
216. lets an admin read any case ✅
217. refuses a signed-out caller ✅
218. refuses a participant, even on a case row they created themselves ✅

**requestee participant access > getParticipantProfile for a firm** → `getParticipantProfile — lib/participant/getParticipantProfile.ts; requesteeParticipantProfile — lib/participant/requesteeAccess.ts`

219. shows a participant on the firm's case, without any private field ✅
220. refuses a participant who isn't on that case, even with the firm's own case id ✅
221. refuses a case the firm doesn't own ✅
222. refuses without a case ✅

**requestee participant access > searchParticipantsForCase** → `searchParticipantsForCase — lib/actions/requesteeParticipant.ts`

223. returns only name, city, age and political affiliation ✅
224. strips characters that would add filters to the database query ✅
225. refuses a case the firm doesn't own ✅
226. refuses a participant who has created a case row of their own ✅

**requestee participant access > requesteeAddParticipants** → `requesteeAddParticipants — lib/actions/requesteeParticipant.ts`

227. refuses a participant who has created a case row of their own ✅

### client/__tests__/rls.test.ts (18)


**RLS (Row Level Security) > rls-roles.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

228. Roles immutable ✅
229. No self-promotion ✅

**RLS (Row Level Security) > rls-cases.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

230. Requestee sees own cases only ✅
231. Participant sees none ✅
232. Admin sees all ✅

**RLS (Row Level Security) > rls-case-documents.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

233. Same access partitioning as cases ✅

**RLS (Row Level Security) > rls-session-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

234. Participants see only their own invites ✅

**RLS (Row Level Security) > rls-jury-participants.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

235. Participant sees own row ✅
236. Admin sees all ✅
237. Requestee reads no participant rows directly ✅

**RLS (Row Level Security) > rls-storage-objects.test.ts** → `(none — TypeScript RLS simulator inside the test, not real Postgres)`

238. Participant reads only their OWN driver license ✅
239. Participant cannot read case documents ✅
240. Admin reads any license and any case document ✅
241. Requestee reads/deletes only their OWN case documents ✅
242. Owner may overwrite/delete own file; non-owner non-admin cannot ✅
243. Admin can overwrite an existing participant license (policy #4) but not a case doc ✅
244. INSERT is owner-scoped: the caller becomes the owner ✅
245. service_role bypasses storage RLS (video upload script) ✅

### client/__tests__/roster-order.test.ts (14)


**rosterGroup** → `rosterGroup — lib/participant/rosterOrder.ts`

246. buckets each invite status ✅
247. treats the legacy 'rejected' spelling as declined ✅
248. reads null and unknown statuses as pending ✅
249. lets a strike outrank the status it was applied to ✅

**rosterStatusLabel** → `rosterStatusLabel — lib/participant/rosterOrder.ts`

250. labels every group ✅

**sortRoster** → `sortRoster, compareRosterEntries — lib/participant/rosterOrder.ts`

251. orders accepted → waitlisted → declined → pending → struck ✅
252. matches the declared group order ✅
253. keeps the reserve out of the seated group ✅
254. lets a strike outrank a waitlist slot ✅
255. sorts alphabetically inside a group, not across groups ✅
256. sorts on the displayed 'First Last' string ✅
257. does not mutate the input array ✅
258. keeps equal entries stable ✅
259. handles an empty roster ✅

### client/__tests__/session-start.test.ts (20)


**sessionStartInstant** → `sessionStartInstant — lib/participant/sessionStart.ts`

260. anchors to the earliest case start time, not the first row ✅
261. accepts HH:MM as well as HH:MM:SS ✅
262. tolerates a full timestamp in the date column ✅
263. falls back to midnight UTC when the session has no case times ✅
264. returns null when there is no usable date ✅
265. ignores unparseable times rather than throwing ✅

**hasSessionStarted** → `hasSessionStarted — lib/participant/sessionStart.ts`

266. is false a minute before the first case begins ✅
267. is true exactly at the first case start ✅
268. stays true while the session runs and after it ends ✅
269. is false earlier the same day ✅
270. does not block when the date cannot be read ✅

**sessionEndInstant** → `sessionEndInstant — lib/participant/sessionStart.ts`

271. takes the latest case end ✅
272. rolls an end past midnight onto the next day ✅
273. falls back to the start when there are no end times ✅
274. returns null when the date cannot be read ✅

**cooldownAfterSession** → `cooldownAfterSession — lib/participant/sessionStart.ts`

275. is the day after the session ends, in UTC ✅
276. counts from the real end of a session that runs past midnight ✅
277. crosses a month boundary without drifting ✅
278. crosses a year boundary ✅
279. returns null when the session times cannot be read, so the cooldown is left alone ✅

### client/__tests__/sessions.test.ts (60)


**Sessions > create-session.test.ts** → `createSession — lib/actions/session.ts`

280. Inserts row with admin as created_by ✅
281. Non-admin blocked ✅

**Sessions > add-cases-to-session.test.ts** → `addCasesToSession — lib/actions/session.ts (+ localToUTCTime)`

282. Creates one row per case ✅
283. Correct UTC time conversion ✅
284. Updates each case's admin_scheduled_at ✅
285. Attaching all-offline cases is fine ✅
286. Refuses a selection that mixes in-person and online cases ✅
287. Refuses an online case joining a session that already holds in-person ones ✅
288. An in-person case may join a session that already holds in-person ones ✅

**Sessions > replace-case-in-session.test.ts** → `replaceCaseInSession — lib/actions/session.ts`

289. Swaps in a case of the same format ✅
290. Refuses a replacement of the other format ✅
291. Refuses to flip the format of a session by replacing its ONLY case ✅

**Sessions > invite-participants.test.ts** → `inviteParticipants — lib/actions/session.ts`

292. One pending row per invitee ✅
293. Never exceeds number_of_attendees ✅
294. Sends one email per invitee ✅
295. An online invite quotes $30/hr, says Zoom, and mentions the waitlist ✅
296. An in-person invite quotes $40/hr and the in-person waitlist terms ✅
297. Drops blacklisted invitees (roles + blacklisted_at) and only invites the rest ✅
298. Inserts nothing when every invitee is blacklisted ✅
299. One FK-rejected participant does not block the rest of the batch ✅
300. Never inserts a participant who has no login account ✅
301. Inserts nothing when no selected participant has a login account ✅
302. Resolves the invite email from jury_participants, not the auth admin API ✅
303. Reports the all-skipped case as a failure, not a silent success ✅
304. Drops invitees who are not active panel members ✅
305. Inserts nothing when no invitee is an active panel member ✅

**Sessions > update-invite-status.test.ts** → `updateInviteStatus — lib/participant/updateInviteStatus.ts`

306. pending → accepted ✅
307. pending → declined ✅
308. Session full blocked ✅
309. Incomplete profile blocked ✅
310. Non-active participant blocked from accepting ✅
311. Active status is checked before the profile gate ✅
312. Accepting is blocked once the session has started ✅
313. Accepting once the seats are gone ASKS first and writes nothing ✅
314. Confirming the offer writes the reserve slot ✅
315. Turning down the offer declines, and records that it was the waitlist ✅
316. A plain decline records no waitlist reason but still clears the money ✅
317. Takes the second waitlist slot when one is already filled ✅
318. A seat records the hourly payout for the session length ✅
319. A seat on an in-person session is paid the in-person rate ✅
320. A full in-person session offers a waitlist slot on IN-PERSON terms ✅
321. An in-person waitlist accept records the $30 waiting fee, not $10 ✅
322. The same session online WOULD offer a waitlist slot ✅
323. Declining still works after the session has started ✅
324. A non-active participant can still decline ✅
325. Double response blocked ✅

**Sessions > recordBackoutStrike** → `recordBackoutStrike — lib/actions/participantFlags.ts`

326. stamps struck_at on the session invite row ✅
327. records struck_by when the acting admin is known ✅
328. is idempotent per session — an already-struck invite is a no-op ✅
329. no-ops when the participant has no invite for that session ✅
330. increments flag_count and does NOT blacklist below the limit ✅
331. auto-blacklists when the third flag is reached ✅
332. records the session strike but counts no flag for a legacy (oldData) id ✅

**Sessions > reschedule-session.test.ts** → `rescheduleSession — lib/actions/session.ts`

333. Reprices seats to the new session length ✅
334. Uses the session's own rate, so an in-person seat reprices at $40/hr ✅
335. Targets only seated rows, never a waitlister's flat fee ✅
336. Never originates money on a pre-backfill null payout ✅
337. Refuses to write $0 when the times come back unreadable ✅
338. Leaves a past-dated session's payouts alone ✅
339. Moves the cooldown with the session ✅

### client/__tests__/timezone.test.ts (10)


**localToUTC** → `localToUTC — lib/timezone.ts`

340. returns the same instant when the timezone is UTC ✅
341. adds 5h for America/New_York during standard time (January) ✅
342. adds 4h for America/New_York during DST (July) ✅
343. subtracts 5:30 for Asia/Kolkata (non-whole-hour offset) ✅
344. handles a date inside the spring-forward window without throwing ✅
345. handles a date inside the fall-back ambiguous window without throwing ✅
346. throws for an invalid IANA zone string ✅

**localToUTCTime** → `localToUTCTime — lib/timezone.ts`

347. returns the HH:MM:SS portion of the UTC instant ✅
348. returns the DST-adjusted time in July ✅
349. returns 04:30:00 for 10:00 Asia/Kolkata ✅

### client/__tests__/underage-account.test.ts (10)


**deleteAccountIfUnderage** → `deleteAccountIfUnderage — lib/actions/underageAccount.ts`

350. deletes nothing for an adult ✅
351. deletes nothing for a missing, malformed or future date (a form error, not an age) ✅
352. removes the ID images, every row and then the login — all for the caller only ✅
353. also removes an ID image stored outside the user's folder ✅
354. deletes a legacy participant with no roles row, and skips storage when there's nothing in it ✅
355. deletes a blacklisted participant ✅
356. refuses admins and requestees without deleting anything ✅
357. deletes nothing when signed out ✅
358. stops before removing the login when a row can't be deleted, so a retry can finish ✅
359. reports a failed login delete instead of claiming success ✅

### client/__tests__/waitlist.test.ts (16)


**assignSlot** → `assignSlot — lib/participant/waitlist.ts`

360. gives a seat while seats remain ✅
361. starts the waitlist exactly at the cap ✅
362. refuses only once both the seats and the waitlist are gone ✅
363. still offers a seat when a called-in waitlister pushed the count past the cap ✅
364. honours a per-session waitlist cap of zero ✅

**sessionLengthHours** → `sessionLengthHours — lib/participant/waitlist.ts`

365. spans the earliest start to the latest end across every case ✅
366. measures a single case ✅
367. handles a half-hour session ✅
368. treats an end before the start as running past midnight ✅
369. returns 0 when times are missing or unparseable ✅

**payouts** → `seatPayoutCents, waitlistPayoutCents, formatCents — lib/participant/waitlist.ts`

370. pays a seat the hourly rate for the session length ✅
371. rounds a fractional session to whole cents ✅
372. pays a called-in waitlister the FULL session, not the remainder ✅
373. pays a waited-out waitlister the flat fee regardless of session length ✅
374. renders a missing amount as a dash rather than $0.00 ✅

**isWaitlisted** → `isWaitlisted — lib/participant/waitlist.ts`

375. matches only the waitlisted status ✅

