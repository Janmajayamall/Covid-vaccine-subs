const venom = require("venom-bot");
const axios = require("axios");
const { MongoClient } = require("mongodb");

const showLogs = true;

// GOVERNMENT API FUNCTIONS
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

	if (centers.length === 0) {
		return "";
	}

	let generatedText = `*Vaccine availability for age group ${ageGroup}+ at PINCODE ${pincode}*\n\n`;
	centers.forEach((center) => {
		let centerText = `_${center.name},_ _${center.address},_ _${center.district_name},_ _${center.pincode}_\n`;
		center.sessions.forEach((session, index) => {
			let text = `${index + 1}. ${session.available_capacity} doses of ${
				session.vaccine
			} available for ${session.min_age_limit}+ on ${session.date}\n`;
			centerText = centerText + text;
		});
		generatedText = generatedText + centerText + "\n\n";
	});

	// adding ending
	generatedText =
		generatedText +
		"*Book your slot* - https://selfregistration.cowin.gov.in\n\n *To reach out* -\nhttps://twitter.com/Janmajaya_mall\n\nhttps://www.instagram.com/ankeitamall/";
	return generatedText;
}

async function getVaccineInfoByPincode(pincode, date) {
	try {
		const res = await axios({
			url:
				"https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin",
			method: "get",
			params: {
				pincode: pincode,
				date: date,
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
		if (showLogs) {
			printError(
				`ERROR IN FETCHING DATA FROM GOV API FOR PINCODE ${pincode} FOR DATE ${date} WITH ERROR - ${e.response.data.error}`
			);
		}
		return undefined;
	}
}

// MONGODB FUNCTIONS
async function connectToMongoDB() {
	try {
		const uri = process.env.MONGODB_URI;
		const client = new MongoClient(uri, { useUnifiedTopology: true });
		await client.connect();

		if (showLogs) {
			printLine();
			console.log(
				`CONNECTED TO ${process.env.NODE_ENV} MONGODB DATABASE\n`
			);
			printLine();
			printDoubleSpace();
		}

		return client;
	} catch (e) {
		printError(
			`FAILED TO ESTABLISH CONNECTION WITH ${process.env.NODE_ENV} MONGODB DATABASE`
		);

		return undefined;
	}
}

async function getDistinctPincodes(collection) {
	try {
		const res = collection.distinct("pincode");
		return res;
	} catch (e) {
		printError(`ERROR IN FETCHING DISTINCT PINCODES`);
		return [];
	}
}

async function getSubsOfPincodeByAgeGroup(collection, ageGroup, pincode) {
	try {
		const res = await collection
			.find({
				pincode: pincode,
				ageGroups: `${ageGroup}+`,
			})
			.toArray();

		return res;
	} catch (e) {
		printError(
			`ERROR IN FETCHING SUBSCRIBERS LIST FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}`
		);
		return undefined;
	}
}

// PRINT FUNCTIONS
async function printLine() {
	console.log(
		"--------------------------------------------------------------------------------\n"
	);
}

async function printDoubleSpace() {
	console.log("\n\n");
}

async function printShortDivider() {
	console.log("XXXXXXXXXXXXXXXX\n");
}

async function printError(error) {
	console.log(`********* ${error} *********\n`);
}

// UTIL FUNCTIONS
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
function generateDate() {
	return new Date().toLocaleDateString("en-IN").split("/").join("-");
}

// MAIN FUNCTION
async function initiateService(venomClient) {
	// connecting to mongodb client
	const mongoConnection = await connectToMongoDB();
	if (mongoConnection == undefined) {
		return;
	}
	const entriesCollection = mongoConnection.db("subs").collection("entries");

	// get distinct pincodes
	const allPincodes = await getDistinctPincodes(entriesCollection);

	// get date
	const date = generateDate();
	if (showLogs) {
		printLine();
		console.log(`TODAY'S DATE - ${date}`);
		printLine();
	}

	if (showLogs) {
		printLine();
		console.log(`NUMBER OF DISTINCT PINCODES - ${allPincodes.length}`);
		printLine();
	}

	for (let i = 0; i < allPincodes.length; i++) {
		const pincode = allPincodes[i];

		if (showLogs) {
			printDoubleSpace();
			printLine();
			console.log(`INITIATING SERVICE FOR PINCODE - ${pincode}\n`);
		}

		// get vaccine info from gov API according to pincode
		const centersInfo = await getVaccineInfoByPincode(
			pincode,
			"08-05-2021"
		);
		if (centersInfo == undefined) {
			continue;
		}
		if (showLogs) {
			console.log(
				`FETCHED VACCINE DATA FROM GOVERNMENT API FOR ${pincode} FOR DATE ${date}\n`
			);
		}

		// send notifications to subs by age group
		const ageGroups = [18, 45];
		for (let j = 0; j < ageGroups.length; j++) {
			const ageGroup = ageGroups[j];

			if (showLogs) {
				printShortDivider();
				console.log(
					`INITIATING WORK ON AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
				);
			}

			// generate text for the age group according to pincode
			const textMessage = generateMessageForAgeGroup(
				centersInfo,
				ageGroup,
				pincode
			);

			if (showLogs) {
				console.log(
					`TEXT MESSAGE FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode} GENERATED SUCCESSFULLY\n`
				);
			}

			if (textMessage.length !== 0) {
				if (showLogs) {
					console.log(
						`VACCINE AVAILABLE FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}. TEXT MESSAGES WILL BE SENT\n`
					);
				}

				// get subscribers for the pincode according to age group
				const subscribers = await getSubsOfPincodeByAgeGroup(
					entriesCollection,
					ageGroup,
					pincode
				);
				if (subscribers == undefined) {
					continue;
				}

				if (showLogs) {
					console.log(
						`FETCHED SUBSCRIBERS LIST FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}. ${subscribers.length} SUBSCRIBERS\n`
					);
					printDoubleSpace();
					console.log(
						`INITIATING SENDING WHATSAPP MESSAGE TO SUBSCRIBERS FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
					);
				}

				// send text to each subscriber
				for (let z = 0; z < subscribers.length; z++) {
					const sub = subscribers[z];
					try {
						await venomClient.sendText(
							`91${sub.phoneNumber}@c.us`,
							textMessage
						);

						// sleep for 0.5 seconds
						await sleep(500);
					} catch (e) {
						if (showLogs) {
							printError(
								`SENDING WHATSAPP MESSAGE TO ${sub.phoneNumber} FAILED WITH ERROR - ${e.text} FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
							);
						}
					}
				}

				if (showLogs) {
					console.log(
						`COMPLETED SENDING WHATSAPP MESSAGE TO SUBSCRIBERS FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
					);
					printDoubleSpace();
				}
			} else {
				if (showLogs) {
					console.log(
						`VACCINE NOT AVAILABLE FOR AGE GROUP - ${ageGroup} for PINCODE - ${pincode}. TEXT MESSAGE WILL NOT BE SENT\n`
					);
				}
			}

			if (showLogs) {
				console.log(
					`COMPLETED WORK ON AGE GROUP - ${ageGroup} for PINCODE - ${pincode}\n`
				);
				printShortDivider();
			}
		}

		if (showLogs) {
			console.log(`COMPLETED SERVICE FOR PINCODE - ${pincode}\n`);
			printLine();
			printDoubleSpace();
		}

		await sleep(5000);
	}

	// closing mongodb connection
	mongoConnection.close();
	if (showLogs) {
		printLine();
		console.log(
			`CLOSE CONNECTION WITH ${process.env.NODE_ENV} MONGODB DATABASE\n`
		);
		printLine();
		printDoubleSpace();
	}

	return;
}

// STARTING VENOM
venom
	.create()
	.then(async (client) => {
		if (showLogs) {
			printLine();
			console.log(`INITIATING MAIN SERVICE\n`);
			printLine();
			printDoubleSpace();
		}

		// initiate the process
		await initiateService(client);

		if (showLogs) {
			printDoubleSpace();
			printLine();
			console.log(`COMPLETED MAIN SERVICE\n`);
			printLine();
		}
	})
	.catch((error) => {
		console.log(error);
	});
