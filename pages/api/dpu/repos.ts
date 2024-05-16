import { NextApiRequest, NextApiResponse } from "next";
import { RepoIdentifier } from "../../../types/repository";
import { getUserRepositoriesByTopic } from "../../../utils/db/repos";
import { getUserIdByTopicName } from "../../../utils/db/users";
import rudderStackEvents from '../events';

const reposHandler = async (req: NextApiRequest, res: NextApiResponse) => {
	const { topicId, provider } = req.query;
	
	const event_properties = {
		topicName: topicId as string,
		provider: provider as string,
	};

	if (!topicId || !provider 
		|| Array.isArray(topicId) || Array.isArray(provider)
		|| topicId.length === 0 || provider.length === 0) {
		res.status(400).json({ error: 'Invalid get request body' });
		const eventProperties = { ...event_properties, response_status: 400 };
		rudderStackEvents.track("absent", "", 'dpu/repos', { type: 'invalid-body', eventStatusFlag: 0, eventProperties });
		return;
	}

	const userId = await getUserIdByTopicName(topicId as string).catch((error: any) => {
		console.error("[setupHandler/getUserIdByTopicName] Failed to fetch userId from the database.", error);
		const eventProperties = { ...event_properties, response_status: 500 };
		rudderStackEvents.track("absent", "", 'dpu/repos', { type: 'user-data-for-topic', eventStatusFlag: 0, eventProperties });
		return "";
	});
	const repoList: RepoIdentifier[] | null = await getUserRepositoriesByTopic(topicId, provider).catch((err) => {
		console.error(`[reposHandler] Unable to get user repos for topic ${topicId}`);
		const eventProperties = { ...event_properties, response_status: 400 };
		rudderStackEvents.track(userId, "", 'dpu/repos', { type: 'user-repos-for-topic', eventStatusFlag: 0, eventProperties });
		return null;
	});
	if (repoList == null) {
		res.status(500).json({"error": "Unable to get user repos from db"});
		const eventProperties = { ...event_properties, response_status: 500 };
		rudderStackEvents.track(userId, "", 'dpu/repos', { type: 'empty-repos-list-from-db', eventStatusFlag: 0, eventProperties });
		return;
	}
	res.status(200).json({repoList: repoList});
	const eventProperties = { ...event_properties, repoList, response_status: 200 };
	rudderStackEvents.track(userId, "", 'dpu/repos', { type: 'get-user-repos', eventStatusFlag: 1, eventProperties });
	return;
}

export default reposHandler;