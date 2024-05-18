//CODE TO COPY TO S3 

const {
	CloudWatchLogsClient,
	DescribeLogGroupsCommand,
	FilterLogEventsCommand,
} = require("@aws-sdk/client-cloudwatch-logs")
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const zlib = require("zlib")

// Initialize AWS SDK clients
const cloudWatchLogsClient = new CloudWatchLogsClient({ region: "ap-south-1" })
const s3Client = new S3Client({
	region: "us-east-1",
	endpoint: "https://s3.amazonaws.com",
})

// Function to retrieve log events for a log group
async function retrieveLogEvents(logGroupName) {
	const logEvents = []
	let nextToken = null

	do {
		const params = {
			logGroupName: logGroupName,
			nextToken: nextToken,
		}

		const command = new FilterLogEventsCommand(params)
		const response = await cloudWatchLogsClient.send(command)

		if (response.events) {
			logEvents.push(...response.events)
		}

		nextToken = response.nextToken
	} while (nextToken)

	return logEvents
}

// Function to upload log events to S3
async function uploadToS3(logGroupName, logEvents) {
	console.log(logGroupName)
	const compressedData = zlib.gzipSync(JSON.stringify(logEvents)) // Use gzipSync to compress synchronously
	console.log("@@", compressedData)
	// const hash = crypto
	// 	.createHash("md5")
	// 	.update(JSON.stringify(logEvents))
	// 	.digest("hex")
	const params = {
		Bucket: "lambda-logs-shiva",
		Key: `${logGroupName}.json.gz`,
		Body: compressedData,
	}
	const command = new PutObjectCommand(params)
	const res = await s3Client.send(command)
	console.log("put", res)
}

// // Main function to copy logs to S3
// async function copyLogsToS3() {
// 	const logGroups = await describeLogGroups()

// 	for (const logGroup of logGroups) {
// 		const logGroupName = logGroup.logGroupName
// 		const logEvents = await retrieveLogEvents(logGroupName)
// 		await uploadToS3(logGroupName, logEvents)
// 		console.log(`Logs for ${logGroupName} copied to S3.`)
// 	}
// }

// Updated copyLogsToS3 function with batch processing
async function copyLogsToS3() {
	const logGroups = await describeLogGroups()
	console.log("@1", logGroups)

	// Define batch size (number of log groups to process per batch)
	const batchSize = 2 // You can adjust this based on your requirements

	// Process log groups in batches
	for (let i = 0; i < logGroups.length; i += batchSize) {
		const batch = logGroups.slice(i, i + batchSize)
		const batchPromises = batch.map(async logGroup => {
			const logGroupName = logGroup.logGroupName
			console.log("@2", logGroupName)
			const logEvents = await retrieveLogEvents(logGroupName)
			console.log("@3", logEvents)
			await uploadToS3(logGroupName, logEvents)
			console.log(`Logs for ${logGroupName} copied to S3.`)
		})
		// Wait for all log groups in the batch to be processed before proceeding to the next batch
		await Promise.all(batchPromises)
	}
}

// Function to describe log groups associated with Lambda functions
async function describeLogGroups() {
	const params = {
		logGroupNamePrefix: "/aws/lambda/",
	}

	const command = new DescribeLogGroupsCommand(params)
	const response = await cloudWatchLogsClient.send(command)

	return response.logGroups
}

// Lambda handler function
module.exports.handler = async function (event, context) {
	try {
		const some = await copyLogsToS3()
		console.log("final", some)
		return {
			statusCode: 200,
			body: JSON.stringify("Logs copied successfully."),
		}
	} catch (error) {
		console.error("Error copying logs:", error)
		return {
			statusCode: 500,
			body: JSON.stringify("Error copying logs."),
		}
	}
}
