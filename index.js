const venom = require("venom-bot");
const axios = require("axios");
const { MongoClient } = require("mongodb");

function generateMessageForAgeGroup(centersInfo, ageGroup, pincode) {
	const centers = centersInfo
		.map((center) => {
			let avlSessions = center.sessions.filter((session) => {
				return (
					session.available_capacity !== 0 &&
					session.min_age_limit == ageGroup
				);
			});
			return avlSessions.length !== 0
				? {
						...center,
						sessions: avlSessions,
				  }
				: undefined;
		})
		.filter((center) => {
			return center != undefined;
		});

	let generatedText = `*Vaccine availability for age group ${ageGroup}+ at PINCODE ${pincode}*\n\n`;
	centers.forEach((center) => {
		let centerText = `_${center.name},_ _${center.address},_ _${center.district_name},_ _${center.pincode}_\n`;
		center.sessions.forEach((session, index) => {
			let text = `${index + 1}. ${session.available_capacity} doses of ${
				session.vaccine
			} available for ${session.min_age_limit}+ on ${session.date}\n`;
			centerText = centerText + text;
		});
		generatedText = generatedText + centerText + "\n";
	});
	return generatedText;
}

async function getVaccineInfoByPincode(pincode) {
	try {
		const res = await axios({
			url:
				"https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin",
			method: "get",
			params: {
				pincode: pincode,
				date: "08-05-2021",
			},
			headers: {
				accept: "application/json, text/plain",
				"accept-encoding": "gzip, deflate, br",
				"accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
				origin: "https://www.cowin.gov.in",
				referer: "https://www.cowin.gov.in/",
				"user-agent":
					"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
			},
		});
		// console.log(JSON.stringify(res.data.centers, null, 2));
		return res.data.centers;
	} catch (e) {
		console.log(e, "this is the error *******");
	}
}

async function connectToMongoDB() {
	const uri =
		"mongodb+srv://hkuuser:hkuuser2021@cluster0.d0hs5.mongodb.net/production?retryWrites=true&w=majority";
	const client = new MongoClient(uri, { useUnifiedTopology: true });
	await client.connect();
	return client.db("production").collection("entries");
}

function getDistinctPincodes(collection) {
	return collection.distinct("pincode");
}

async function mainFunction(venomClient) {
	// connecting to mongodb client
	const entriesCollection = await connectToMongoDB();

	// get distinct pincodes
	const allPincodes = await getDistinctPincodes(entriesCollection);

	for (let i = 0; i < allPincodes.length; i++) {
		const pincode = allPincodes[i];

		// validating pincode

		// get vaccine info from gov API using pincode
		const centersInfo = await getVaccineInfoByPincode(pincode);
		const textFor45 = generateMessageForAgeGroup(centersInfo, 45, pincode);

		venomClient
			.sendText("918889509829@c.us", textFor45)
			.catch((error) => {});
	}

	return;
}

venom
	.create()
	.then(async (client) => {
		// initiate the process
		await mainFunction(client);
	})
	.catch((error) => {
		console.log(error);
	});

// work left
// 1. query matching numbers and send text
