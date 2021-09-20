// This function is the webhook's request handler.
exports = async function (payload, response) {
	// creating answer object
	// const answers = EJSON.parse(payload.body.text()).form_response.answers
	const answers = EJSON.parse(payload.body.text());

	const answersObj = {};
	answersObj["phoneNumber"] = answers.phoneNumber;
	answersObj["pincode"] = answers.pincode;
	answersObj["ageGroups"] = answers.ageGroups;
	answersObj["status"] = "ACTIVE";

	// insert/update data into collection
	return context.services
		.get("mongodb-atlas")
		.db("subs")
		.collection("entries")
		.updateOne(
			{
				phoneNumber: answersObj.phoneNumber,
				pincode: answersObj.pincode,
			},
			answersObj,
			{
				upsert: true,
			}
		); //d
};
