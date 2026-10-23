import { uploadMeeting } from "@/app/actions";
import { FileToTextarea, SubmitButton } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { getActiveProfile } from "@/lib/voice";

export default async function NewMeeting() {
  const profile = await getActiveProfile();
  const types = ["general", ...profile.templates.map((t) => t.meetingType)];

  return (
    <>
      <PageHeader
        stage="01 · ingest"
        title="New meeting"
        sub="Upload a transcript by hand. Zoom meetings arrive here automatically once the webhook is connected."
      />
      <form action={uploadMeeting} className="card grid gap-5 p-6 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="topic">
            Meeting title
          </label>
          <input id="topic" name="topic" className="input" placeholder="Acme pilot kickoff" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="meetingType">
              Meeting type
            </label>
            <select id="meetingType" name="meetingType" className="input">
              {[...new Set(types)].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="date">
              Date
            </label>
            <input id="date" name="date" type="datetime-local" className="input" />
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="attendees">
            Attendees <span className="normal-case">(one per line: Name &lt;email&gt;)</span>
          </label>
          <textarea id="attendees" name="attendees" rows={3} className="input font-mono" placeholder={"Jordan Lee <jordan@acme.com>"} />
          <p className="mt-1 text-xs text-muted">Anyone without an email is flagged for you to confirm. Echo never guesses addresses.</p>
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <label className="label mb-0" htmlFor="transcript">
              Transcript (.vtt or plain text)
            </label>
            <FileToTextarea target="transcript" />
          </div>
          <textarea id="transcript" name="transcript" rows={14} required className="input font-mono text-xs" placeholder={"WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nSam: Thanks for making the time…"} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <SubmitButton pendingText="Uploading…">Generate draft</SubmitButton>
        </div>
      </form>
    </>
  );
}
