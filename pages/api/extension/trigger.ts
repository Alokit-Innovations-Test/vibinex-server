import type { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt'
import { getRepoConfig, getUserInfoFromDb } from '../../../utils/db/trigger';
import { publishMessage } from '../../../utils/pubsub/pubsubClient';

export default async function triggeHandler(req: NextApiRequest, res: NextApiResponse) {
	// For cors prefetch options request
	if (req.method == "OPTIONS") {
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.status(200).send("Ok");
		return;
	}
	// For normal requests
	console.info("[extension/triggeHandler] Getting setup repos info for ", req.body.owner);

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are allowed' });
	}
    const user = await getToken({ req: req }).catch((err) => {
		console.error("[extension/triggeHandler] Error getting user token", err);
		return null;
	});
    if (!user || !user.email) {
        console.error("[extension/triggeHandler] Error getting user");
        return res.status(401).json({ error: 'Unauthenticated', message: 'Incorrect auth token in request' });
    }
	const { url } = req.body;
	if (!url) {
        console.error("[extension/triggeHandler] Error parsing url");
		return res.status(400).json({ error: 'Bad Request', message: 'url is required in the request body' });
	}
    
	await triggerDPU(url, user.email)
		.catch((error: Error) => {
			console.error('[extension/triggeHandler] Error triggering dpu for: ' + user.id + ' and pr: ' + url, error);
			res.status(500).json({ error: 'Internal Server Error', message: 'An error occurred while triggering dpu' });
		});
    res.status(200);
}
async function triggerDPU(url: string, userEmail: string) {
    // parse url for repo name, owner, pr, provider
    const {repoProvider, repoOwner, repoName, prNumber} = parseURL(url);
    // get user id
    const {userId, topicName} = await getUserInfoFromDb(userEmail);
    // get repo config
    const repoConfig = await getRepoConfig(repoProvider, repoName, repoOwner, userId);
    // prepare body
    const triggerBody = prepareBody(repoProvider, repoOwner, repoName, prNumber, repoConfig);
    // get topic id
    // publish
    await publishMessage(topicName, triggerBody, "manual_trigger")
		.catch((error) => {
			console.error(`[triggerDPU] Failed to publish message on ${topicName}:`, error);
            throw new Error('Unable to publish message');
		});
}

function parseURL(url: string) {
    // Regular expression to match the GitHub pull request URL pattern
    const regex = /^https:\/\/github.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/;
    ///
    //     ^: This anchors the match to the beginning of the string. It ensures that the pattern starts matching from the very beginning of the URL.
    // https:\/\/github.com\/: This part of the regex is a literal match for the protocol (https://) and the domain (github.com/). 
    //Since some characters, like /, have special meanings in regex, they need to be escaped with a backslash (\) to be treated literally.
    // ([^/]+): This is a capturing group ((...)). [^/] is a character set that matches any character except /, and + means one or more occurrences of the preceding character set. 
    //So ([^/]+) matches and captures one or more characters that are not /. This group is capturing the repository owner.
    // \/: This matches the forward slash (/) after the repository owner. Again, it's escaped with a backslash to be treated as a literal character.
    // ([^/]+): Similar to the previous group, this captures one or more characters that are not /. This group captures the repository name.
    // \/pull\/: This matches the literal string /pull/. It indicates the beginning of the pull request number in the URL.
    // (\d+): This captures one or more digits (\d+). This group captures the pull request number.
    // $: This anchors the match to the end of the string. It ensures that the entire URL matches the pattern, and there are no extra characters at the end.
    
    // Match the URL with the regex
    const match = url.match(regex);
    
    // Check if the URL matches the expected pattern
    if (!match) {
        throw new Error("Invalid GitHub pull request URL");
    }
    
    // Extract the matched groups
    const [, repoOwner, repoName, prNumber] = match;
    
    // Extract the repo provider from the URL
    const repoProvider = "github";
    
    // Return the extracted information as an object
    return {
        repoProvider,
        repoOwner,
        repoName,
        prNumber: prNumber.toString()
    };
}

function prepareBody(repoProvider: string, repoOwner: string, repoName: string, prNumber: string, repoConfig: any) {
    return {
        repo_provider: repoProvider,
        repo_owner: repoOwner,
        repo_name: repoName,
        pr_number: prNumber,
        repo_config: repoConfig,
    }
}
