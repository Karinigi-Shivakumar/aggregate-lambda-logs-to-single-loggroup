const {
	CloudWatchLogsClient,
	PutLogEventsCommand,
	CreateLogStreamCommand,
} = require("@aws-sdk/client-cloudwatch-logs")
const {
	S3Client,
	GetObjectCommand,
	ListObjectsV2Command,
} = require("@aws-sdk/client-s3")
const zlib = require("zlib")

// Initialize AWS SDK clients
const cloudWatchLogsClient = new CloudWatchLogsClient({ region: "ap-south-1" })
const s3Client = new S3Client({
	region: "us-east-1",
	endpoint: "https://s3.amazonaws.com",
})

async function ensureLogStreamExists(logGroupName, logStreamName) {
	try {
		await cloudWatchLogsClient.send(
			new CreateLogStreamCommand({
				logGroupName: logGroupName,
				logStreamName: logStreamName,
			}),
		)
		console.log(
			`Created log stream ${logStreamName} in log group ${logGroupName}.`,
		)
	} catch (error) {
		if (error.name === "ResourceAlreadyExistsException") {
			console.log(
				`Log stream ${logStreamName} already exists in log group ${logGroupName}.`,
			)
		} else {
			throw error
		}
	}
}
// Function to retrieve log events from S3 and send them to CloudWatch Logs
async function processLogsFromS3(bucketName, logGroupName, objectKey) {
	try {
		const params = { Bucket: bucketName, Key: objectKey }

		// Get object from S3
		const response = await s3Client.send(new GetObjectCommand(params))
		// console.log("@2",response)

		// Create a buffer to store the data
		const chunks = []

		// Read the data from the stream and store it in the buffer
		await new Promise((resolve, reject) => {
			response.Body.on("data", chunk => {
				chunks.push(chunk)
			})
			response.Body.on("end", () => {
				resolve()
			})
			response.Body.on("error", error => {
				reject(error)
			})
		})
		console.log("@3", chunks)

		// Concatenate all chunks into a single buffer
		const buffer = Buffer.concat(chunks)
		console.log("@4", buffer)

		// Decompress the data
		const decompressedData = zlib.gunzipSync(buffer)
		console.log("@5", decompressedData)

		// Parse JSON data
		const logEvents = JSON.parse(decompressedData.toString())
		console.log("@6", logEvents)

		// Send log events to CloudWatch Logs
		const logStreamName = objectKey // Unique stream name
		await ensureLogStreamExists(logGroupName, logStreamName)
		const logEventsParams = {
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			logEvents: logEvents,
		}

		const res = await cloudWatchLogsClient.send(
			new PutLogEventsCommand(logEventsParams),
		)
		console.log("@7", res)

		console.log(
			`Logs from S3 object ${objectKey} processed and sent to CloudWatch Logs group ${logGroupName}.`,
		)
	} catch (error) {
		console.error("Error processing logs from S3:", error)
	}
}

// Function to list objects in S3 bucket
async function listObjectsInBucket(bucketName) {
	try {
		const params = { Bucket: bucketName }
		const { Contents } = await s3Client.send(
			new ListObjectsV2Command(params),
		)
		return Contents.map(object => object.Key)
	} catch (error) {
		console.error("Error listing objects in S3 bucket:", error)
		return []
	}
}

// Lambda handler function
module.exports.handler = async function (event, context) {
	try {
		// Specify your S3 bucket name and CloudWatch Logs group name
		const bucketName = "lambda-logs-shiva"
		const logGroupName = "aws-lambda-logs"

		// List objects in S3 bucket
		const objectKeys = await listObjectsInBucket(bucketName)
		console.log("@1", objectKeys, objectKeys.object)
		// Process logs from each object in S3 and send to CloudWatch Logs
		for (const objectKey of objectKeys) {
			await processLogsFromS3(bucketName, logGroupName, objectKey)
		}

		return {
			statusCode: 200,
			body: JSON.stringify(
				"Logs processed and sent to CloudWatch Logs successfully.",
			),
		}
	} catch (error) {
		console.error("Error processing logs:", error)
		return {
			statusCode: 500,
			body: JSON.stringify("Error processing logs."),
		}
	}
}
