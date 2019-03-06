// Import AWS SDK and instantiate a variable for the AWS Secrets Manager
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

const knex = require('knex');
const moment = require('moment-timezone');

exports.handler = async message => {
  console.log(message);

  try {
    let events = await getEvents();
    events = await processEvents(events);

    await sendEmail(events);
    console.log(`Email sent`);
  } catch (error) {
    // Insert your error reporting tool of choice
    // Rethrow for now
    console.error(`ERROR: ${error}`);
    throw error;
  }

  return {};
}

async function sendEmail (events) {
  const reportDate = new Date();
  const subject = `Events as of ${getPrettyDate(reportDate)}`;
  const body = generateEmailBody(events);

  let params = {
    Destination: {
      // Set to the email address you want the report to go to
      ToAddresses: [process.env.TARGET_EMAIL]
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: body
        }
      },
      Subject: {
        Charset: 'UTF-8',
        Data: subject
      }
    },
    Source: process.env.SOURCE_EMAIL
  };

  const ses = new AWS.SES();
  await ses.sendEmail(params).promise();
}

// Take the interesting events and convert them into a string for the email
// This function currently generates a very simple HTML table to display each event
function generateEmailBody (events) {
  const header = `<h1>Event Report</h1>`;
  const tableHeaders = `
    <thead>
      <tr>
        <td> Event </td>
        <td> Timestamp </td>
      </tr>
    </thead>
  `;

  let tableRows = '';
  events.forEach(event => {
    const row = `
      <tr>
        <td> ${event.id} </td>
        <td> ${event.timestamp} </td>
      </tr>
    `;

    tableRows = tableRows + row;
  });

  const style = `
    <style>
      table {border-collapse: collapse}
      td {border: 1px solid black; padding: 5px}
    </style>
    `;

  return `
  <html>
    <head>${style}</head>
    <body>
      ${header}
      <h3>Interesting Events</h3>
      <table>
        ${tableHeaders}
        ${tableRows}
      </table>
    </body>
  </html>
  `;
}

async function getEvents () {
  const dbPassword = await getDBPassword();

  // We are using knex to connect to the DB
  const db = knex({
    client: 'mysql',
    connection: {
      host: process.env.DB_ADDRESS,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: dbPassword,
      timezone: 'UTC'
    },
    pool: {
      min: 0,
      max: 1,
      syncInterval: 0,
      acquireTimeout: 1000,
      backoff: { min: 500, max: 500 },
      bailAfter: Infinity
    }
  });

  // Fetch the interesting events from the database
  const events = await db
    .select('*')
    .from('usage_events')
    .orderBy('timestamp')
    .limit(5);

  return events;
}

async function processEvents (events) {
  // Do any processing needed
  return events;
}

// Store the SECRETS_NAMESPACE value from the Function's environment variables
const secretsNamespace = process.env.SECRETS_NAMESPACE;

// Cache password for future warm starts
let dbPassword;
async function getDBPassword () {
  // If the password is available [due to this being a warm start], use it
  if (dbPassword) {
    return dbPassword;
  }

  // Construct paramaters to pass to AWS Secrets Manager API call
  // SecretId is a combination of the secret's namespace and the specific secret to return
  let params = {
    SecretId: secretsNamespace + 'dbPassword'
  };

  // Invoke the AWS Secrets Manager API to retrieve the secret
  let response = await secretsManager.getSecretValue(params).promise();

  // Accessing the secret's value of the response object
  dbPassword = response.SecretString;

  return dbPassword;
}

function getPrettyDate (date) {
  return moment(date).tz('America/Los_Angeles').format('MMMM Do YYYY, h:mm a z');
}
