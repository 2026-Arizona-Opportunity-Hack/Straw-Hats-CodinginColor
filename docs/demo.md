# CIC Learn demo

Use one fictional class and one fictional student to show what happens when a learner misses class and returns to work independently.

## Four-minute walkthrough

Before recording, sign in as instructor, student and CIC admin in separate browser profiles or windows with isolated sessions. Open a demo class with two released modules, an in-progress student and at least one scored warm-up and final-check pair. Keep the class code and an example curriculum draft ready. Use [the hosted app](https://cic-learn.vercel.app) with team-provisioned demo accounts.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:25 | Open the class and its curriculum. | When a student misses class, the instructor may have to reteach the lesson. CIC Learn gives students a way to catch up independently. |
| 0:25–1:05 | Show **CIC Library**, a class's **Curriculum** tab, and **Share class code**. Show the CSV review screen if time allows. | A teacher can start from CIC's material, release a module, and invite learners with a code. |
| 1:05–2:15 | Open **My classroom** as the student. Resume a module, show feedback on a check, and submit the final required activity in the prepared module. Return to the course page to show the next module. | The student completes the lesson and can see where to go next. |
| 2:15–3:05 | Open the class **Dashboard** or **Grades**. Show saved work, **Needs attention**, or **Concept mastery**. Open **Impact & learning** as an admin and show the paired scores and learning gain. | Teachers can see where the student needs help. CIC can use paired scores to report changes in learning. |
| 3:05–3:55 | Open **Draft from materials** or a prepared result. Show the student preview and where the instructor publishes. | A PowerPoint or teaching proposal becomes a draft the instructor can review and edit before publishing. |

For the recorded demo, prepare AI output before the timer starts. Use a new or partially completed learner so the next module's release is visible. A final check can itself require a passing counted score or the class's configured attempt rules.

## Local demo

1. Follow [Run it locally](../README.md#run-it-locally). At `/login`, choose **Educator or staff** and use the mock instructor login.
2. Open **Curriculum → Try the curriculum builder → Edit curriculum**. Select **Make a score counter** in the course outline. Under **Module details**, select **Publish update**.
3. Sign out, then choose **Continue as a demo student** in the same browser. From the student home, open **Instructor-published demos → Make a score counter**. Answer a check or submit a written response to see the in-session feedback.
4. To show the Python lab, run `npm run dev:runner` in a second terminal before opening the lab. Set the supplied `score` variable to `3`, choose **Check**, and look for the passing check.
5. Use the mock instructor and admin accounts to explore the preloaded class dashboard and impact reports. Those reports use fictional fixtures. To show a student's attempt changing a staff report, use a connected environment.

The local builder offers a sample **Draft from materials** flow without a model key. The Python runner uses loopback on port 5178 and expects the development app on port 5173. Show durable student responses and live reporting with the connected app. The [maintainer guide](maintainer-guide.md) covers its setup.

## Submission

For the November 15, 2026 event, the [official schedule](https://www.ohack.dev/hack/fall-2026) sets **2:00 PM MST** as the deadline. Push the submission revision to the [team repository](https://github.com/2026-Arizona-Opportunity-Hack/Straw-Hats-CodinginColor), add the project story and demo video of up to four minutes in [Manage Team](https://www.ohack.dev/hack/fall-2026/manageteam), and click **Submit**. Confirm the video opens for a viewer outside the team account.
