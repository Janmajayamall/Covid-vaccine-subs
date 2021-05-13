const venom = require("venom-bot");
const axios = require("axios");
const { MongoClient } = require("mongodb");
const { performance } = require("perf_hooks");

const showLogs = true;

// set to false to send whatsapp messages
const debug = false;

// send notifications to subs by age group 18 | 45
const ageGroups = [18, 45];

// GOVERNMENT API FUNCTIONS
function generateMessageForAgeGroup(centersInfo, ageGroup, pincode) {
	const centers = centersInfo
		.map((center) => {
			let avlSessions = center.sessions.filter((session) => {
				return (
					session.available_capacity >= 1 &&
					session.min_age_limit === ageGroup
				);
			});
			return {
				...center,
				sessions: avlSessions,
			};
		})
		.filter((center) => {
			return center.sessions.length !== 0;
		});

	if (showLogs) {
		console.log(
			`TEXT MESSAGE FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode} GENERATED SUCCESSFULLY\n`
		);
	}

	if (centers.length === 0) {
		return ["", false];
	}

	// good enough indicator
	let goodEnough = false;

	let generatedText = `*Vaccine availability for age group ${ageGroup}+ at PINCODE ${pincode}*\n\n`;
	centers.forEach((center) => {
		let centerText = `_${center.name},_ _${center.address},_ _${center.district_name},_ _${center.pincode}_\n`;
		center.sessions.forEach((session, index) => {
			let text = `${index + 1}. ${session.available_capacity} doses of ${
				session.vaccine
			} available for ${session.min_age_limit}+ on ${session.date}\n`;
			centerText = centerText + text;

			// checking good enough
			if (session.available_capacity > 10) {
				goodEnough = true;
			}
		});
		generatedText = generatedText + centerText + "\n\n";
	});

	// adding ending
	generatedText =
		generatedText +
		"*Book your slot* - https://selfregistration.cowin.gov.in\n\n *To reach out* -\nhttps://twitter.com/Janmajaya_mall\n\nhttps://www.instagram.com/ankeitamall/";
	return [generatedText, goodEnough];
}

async function getVaccineInfoByPincode(pincode, date) {
	try {
		const res = await axios({
			url: "https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin",
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

		const centers = res.data.centers;

		if (Array.isArray(centers) === false) {
			throw new Error("Centers array not returned from GOV. API");
		}

		if (showLogs) {
			console.log(
				`FETCHED VACCINE DATA FROM GOVERNMENT API FOR ${pincode} FOR DATE ${date} FOR CENTERS ${centers.length}\n`
			);
		}

		return centers;
	} catch (e) {
		if (showLogs) {
			printError(
				`ERROR IN FETCHING DATA FROM GOV API FOR PINCODE ${pincode} FOR DATE ${date} WITH ERROR - ${e}`
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

async function addToJustUpdated(collection, pincode, ageGroup) {
	try {
		const res = await collection.insertOne({
			value: `${pincode}-${ageGroup}`,
			createdAt: new Date(Date.now()),
		});

		if (showLogs) {
			`ADDED PINCODE ${pincode} & AGE GROUP ${ageGroup} TO justUpdated COLLECTION\n`;
		}

		return res;
	} catch (e) {
		printError(
			`ERROR IN ADDING PINCODE ${pincode} & AGE GROUP ${ageGroup} TO justUpdated COLLECTION`
		);
		return undefined;
	}
}

async function findInJustUpdated(collection, pincode, ageGroup) {
	try {
		const res = await collection.findOne({
			value: `${pincode}-${ageGroup}`,
		});

		if (res == undefined) {
			return false;
		}

		// stillGoodEnough is true
		if (showLogs) {
			printShortDivider();
			console.log(
				`SKIPPING SINCE PAST MESSAGES FOR PINCODE ${pincode} AND FOR AGE-GROUP ${ageGroup} ARE GOOD ENOUGH\n`
			);
			console.log(res);
			printShortDivider();
		}

		return true;
	} catch (e) {
		printError(
			`ERROR IN FINDING PINCODE ${pincode} & AGE GROUP ${ageGroup} IN justUpdated COLLECTION`
		);
	}
}

async function getDistinctPincodes(collection) {
	try {
		const res = await collection.distinct("pincode");
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
				status: "ACTIVE",
			})
			.toArray();

		console.log(
			`FETCHED SUBSCRIBERS LIST FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}. ${res.length} SUBSCRIBERS\n`
		);

		return res;
	} catch (e) {
		printError(
			`ERROR IN FETCHING SUBSCRIBERS LIST FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}`
		);
		return undefined;
	}
}

async function getPhoneNumbersCount(collection) {
	try {
		const res = await collection.distinct("phoneNumber");
		return res.length;
	} catch (e) {
		printError(`ERROR IN FETCHING DISTINCT PHONE NUMBERS`);
		return 0;
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
	const justUpdatedCollection = mongoConnection
		.db("subs")
		.collection("justUpdated");

	// get distinct pincodes
	const allPincodes = await getDistinctPincodes(entriesCollection);

	// get distinct phoneNumbers count
	const phoneNumbersCount = await getPhoneNumbersCount(entriesCollection);
	if (showLogs) {
		printLine();
		console.log(`DISTINCT PHONE NUMBERS COUNT IS ${phoneNumbersCount}`);
		printLine();
	}

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
		const centersInfo = await getVaccineInfoByPincode(pincode, date);

		if (centersInfo == undefined) {
			continue;
		}

		for (let j = 0; j < ageGroups.length; j++) {
			const ageGroup = ageGroups[j];

			// check whether the pincode and ageGroup combination is good enough
			const stillGoodEnough = await findInJustUpdated(
				justUpdatedCollection,
				pincode,
				ageGroup
			);
			if (stillGoodEnough === true) {
				continue;
			}

			if (showLogs) {
				printShortDivider();
				console.log(
					`INITIATING WORK ON AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
				);
			}

			// generate text for the age group according to pincode
			const [textMessage, goodEnoughText] = generateMessageForAgeGroup(
				centersInfo,
				ageGroup,
				pincode
			);

			// get subscribers for the pincode according to age group
			const subscribers = await getSubsOfPincodeByAgeGroup(
				entriesCollection,
				ageGroup,
				pincode
			);
			if (subscribers == undefined) {
				continue;
			}

			if (textMessage.length !== 0) {
				if (showLogs) {
					console.log(
						`VACCINE AVAILABLE FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}. TEXT MESSAGES WILL BE SENT\n`
					);
				}

				if (showLogs) {
					printDoubleSpace();
					console.log(
						`INITIATING SENDING WHATSAPP MESSAGE TO SUBSCRIBERS FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
					);
				}

				// send text to each subscriber
				for (let z = 0; z < subscribers.length; z++) {
					const sub = subscribers[z];

					if (debug === false) {
						try {
							await venomClient.sendText(
								`91${sub.phoneNumber}@c.us`,
								textMessage
							);
						} catch (e) {
							if (showLogs) {
								printError(
									`SENDING WHATSAPP MESSAGE TO ${sub.phoneNumber} FAILED WITH ERROR - ${e.text} FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
								);
							}
						}
					} else {
						if (showLogs) {
							console.log(
								`DEBUG: SENT FAKE WHATSAPP MESSAGE TO ${sub.phoneNumber} FOR AGE GROUP - ${ageGroup} FOR PINCODE - ${pincode}\n`
							);
						}
					}

					// sleep for 0.5 seconds
					await sleep(500);
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

			// if text message was good enough, then add to justUpdated
			if (goodEnoughText === true) {
				// add to justUpdated
				await addToJustUpdated(
					justUpdatedCollection,
					pincode,
					ageGroup
				);
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

async function main() {
	let runningCount = 0;

	while (true) {
		// creating venom client
		const venomClient = await venom.create();

		// starting time
		let t0 = performance.now();

		if (showLogs) {
			printLine();
			console.log(
				`INITIATING MAIN SERVICE FOR AGE GROUPS ${ageGroups}\n`
			);
			if (debug === true) {
				console.log(`RUNNING IN DEBUG MODE`);
			}
			printLine();
			printDoubleSpace();
		}

		// initiate the process
		await initiateService(venomClient);

		runningCount = runningCount + 1;

		// end time
		let t1 = performance.now();

		// time took for the iteration
		let iterationTime = (t1 - t0) / 1000;

		if (showLogs) {
			printDoubleSpace();
			printLine();
			console.log(
				`COMPLETED MAIN SERVICE FOR AGE GROUPS ${ageGroups}. TIME TAKEN BY ITERATION - ${iterationTime}. ITERATION COUNT - ${runningCount} \n`
			);
			printLine();
		}

		// closing the venom client
		venomClient.close();

		// sleep for 5 mins
		await sleep(300000);
	}

	return;
}

main();

// // STARTING VENOM
// venom
// 	.create()
// 	.then(async (client) => {
// 		try {
// 			await main(client);
// 		} catch (e) {
// 			printError(e, "\n THIS ERROR WAS CAUGHT IN THE END\n");
// 		}
// 	})
// 	.catch((error) => {
// 		console.log(error);
// 	});

// https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin
