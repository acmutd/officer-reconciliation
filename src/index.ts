require('dotenv').config()
import { google } from 'googleapis'
import { WebClient } from '@slack/web-api';

const ignoredUsers = new Set(["John Cole", "ACM Finance", "ACM UTD", "Slackbot"])

async function getGoogleWorkspaceUsers(): Promise<Set<string>> {
  const authClient = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly']
  });
  //@ts-ignore
  authClient.subject = process.env.GOOGLE_WORKSPACE_ADMIN_USER;

  const admin = google.admin({
    version: "directory_v1",
    auth: authClient
  });

  const users = (await admin.users.list({
    domain: "acmutd.co"
  })).data.users;

  if (!users) throw new Error("users is undefined?");

  const names = users.filter(u => !u.suspended).map(u => u.name?.fullName).filter((s): s is string => s !== null && s !== undefined);

  return new Set(names);
}

async function getOfficerSpreadsheetUsers(): Promise<Set<string>> {
  const authClient = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({
    version: 'v4',
    auth: authClient
  });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "'Current ACM Team'!A:B"
  });

  const rows = res.data.values;

  if (!rows) throw new Error("values is undefined?");

  rows.shift(); // remove header
  const names = rows.map(a => `${a[0]} ${a[1]}`);

  return new Set(names);
}

async function getSlackUsers(): Promise<Set<string>> {
  const web = new WebClient(process.env.SLACK_API_KEY);
  const members = (await web.users.list()).members;

  if (!members) throw new Error("members is undefined?");

  const names = members.filter(member => !member.is_bot && !member.deleted && !member.is_invited_user && !member.is_restricted)
    .map(member => member.real_name)
    .filter((s): s is string => s !== undefined)

  return new Set(names);
}

function reportDifferenceBothWays(label1: string, set1: Set<string>, label2: string, set2: Set<string>) {
  reportDifference(label1, set1, label2, set2);
  console.log("==============================================================================")
  reportDifference(label2, set2, label1, set1);
  console.log("==============================================================================")
}

function reportDifference(label1: string, set1: Set<string>, label2: string, set2: Set<string>) {
  for (const user of symmetricDifference(set1, set2)) {
    if (!ignoredUsers.has(user)) {
      console.log(`${user} is in ${label1} but not in ${label2}`);
    }
  }
}

// imagine defining a Set type without this function... 
function symmetricDifference<T>(left: Set<T>, right: Set<T>): Set<T> {
  return new Set([...left].filter(x => !right.has(x)));
}

(async () => {
  const googleWorkspaceUsers = await getGoogleWorkspaceUsers();
  const officerSpreadsheetUsers = await getOfficerSpreadsheetUsers();
  const slackUsers = await getSlackUsers();

  reportDifferenceBothWays("Google Workspace", googleWorkspaceUsers, "Officer Spreadsheet", officerSpreadsheetUsers);
  reportDifferenceBothWays("Google Workspace", googleWorkspaceUsers, "Slack", slackUsers);
  reportDifferenceBothWays("Slack", slackUsers, "Officer Spreadsheet", officerSpreadsheetUsers);
})();