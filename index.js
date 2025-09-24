// index.js
const postmark = require("postmark");

// ---- CONFIG ----
const URL =
  "https://parcari3.ro:8443/parcari/api/Parking/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=PS3:v_123_cad_loc_parcare_arie&geometryName=geometry&outputFormat=application/json&srsname=EPSG:3844&bbox=590355.5353482877,324499.2637742758,590454.5536491674,324582.69862268283,EPSG:3844";

// Postmark API key & email addresses (from env)
const POSTMARK_TOKEN = process.env.POSTMARK_TOKEN;
console.log(POSTMARK_TOKEN);
const MAIL_FROM = process.env.MAIL_FROM || "andrew.radulescu@wearetribus.com";
const MAIL_TO =
  process.env.MAIL_TO ||
  "andrew.radulescu@wearetribus.com, andreeamaria10p@gmail.com, toni.radulescu@wearetribus.com";

// ---- FLAGS ----
const isHeartbeat = process.argv.includes("--heartbeat");

// ---- MAIN ----
(async () => {
  try {
    const res = await fetch(URL, {
      headers: { Accept: "application/json" },
    });
    const text = await res.json();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      console.error("Could not parse JSON. Raw response:", text.slice(0, 200));
      throw err;
    }

    if (!payload?.features) {
      throw new Error("Response does not contain features array");
    }

    const features = payload.features;

    // Filter for cod_parcare === "9020"
    const f9020 = features.filter(
      (f) => f?.properties?.cod_parcare === "9020"
    );

    // From those, check which are free (ocupat === 0)
    const free = f9020.filter((f) => Number(f?.properties?.ocupat) === 0);

    console.log(
      `Found ${f9020.length} with cod_parcare=9020, free: ${free.length}`
    );

    if (free.length > 0 || isHeartbeat) {
      const client = new postmark.ServerClient(POSTMARK_TOKEN);

      const htmlRows =
        free.length > 0
          ? free
              .map(
                (f) => `
            <tr>
              <td>${f.properties?.id}</td>
              <td>${f.properties?.nr_loc_parcare}</td>
              <td>${f.properties?.ocupat}</td>
            </tr>`
              )
              .join("")
          : "<tr><td colspan='3'>No free spots</td></tr>";

      const htmlBody = `
        <h2>${
          isHeartbeat
            ? "Weekly heartbeat"
            : "Free parking spots (cod_parcare=9020)"
        }</h2>
        <p>Checked at: ${new Date().toLocaleString()}</p>
        <table border="1" cellpadding="6" cellspacing="0">
          <thead><tr><th>ID</th><th>Nr Loc</th><th>Ocupat</th></tr></thead>
          <tbody>${htmlRows}</tbody>
        </table>
      `;

      const textBody =
        free.length > 0
          ? free
              .map(
                (f) =>
                  `id=${f.properties?.id}, nr_loc=${f.properties?.nr_loc_parcare}, ocupat=${f.properties?.ocupat}`
              )
              .join("\n")
          : "No free spots at this time.";

      await client.sendEmail({
        From: MAIL_FROM,
        To: MAIL_TO,
        Subject: isHeartbeat
          ? "Weekly heartbeat: Parking script is working"
          : `IMPORTANT: LOC DE PARCARE LIBER IN VITAN (9020): ${free.length}`,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: "outbound",
      });

      console.log("✅ Email sent via Postmark!");
    } else {
      console.log("No free spots found → no email sent.");
    }
  } catch (err) {
    console.error("ERROR:", err.message || err);
    process.exit(1);
  }
})();
