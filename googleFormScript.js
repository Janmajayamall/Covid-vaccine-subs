function onFormSubmit(e) {
	// reference taken from https://gist.github.com/lifehome/db101c66fe547a8ffbffe10d1bc0b426

	const formResponse = e.response.getItemResponses();
	const responseObj = {
		phoneNumber: formResponse[0].getResponse(),
		pincode: formResponse[1].getResponse(),
		ageGroups: formResponse[2].getResponse(),
	};

	// send post request to mongodb
	var options = {
		method: "post",
		payload: JSON.stringify(responseObj),
		contentType: "application/json; charset=utf-8",
	};
	const webhookURL =
		"https://ap-south-1.aws.webhooks.mongodb-realm.com/api/client/v2.0/app/covid-subs-vszah/service/covid-subs/incoming_webhook/webhook0";

	UrlFetchApp.fetch(webhookURL, options);
}
