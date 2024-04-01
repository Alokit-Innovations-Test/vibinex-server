import { NextApiRequest, NextApiResponse } from 'next';
import { SetupReposArgs, removePreviousInstallations, saveSetupReposInDb } from '../../../utils/db/setupRepos';
import { getUserIdByTopicName } from '../../../utils/db/users';
import { insertRepoConfig } from '../../../utils/db/repos';

const setupHandler = async (req: NextApiRequest, res: NextApiResponse) => {
	console.info("[setupHandler]Saving setup info in db...");
	const jsonBody = req.body;
	if (!Array.isArray(jsonBody.info)) {
		console.error("[setupHandler] Invalid request body, 'info' is missing or not an array");
		res.status(400).json({ "error": "Invalid request body" });
		return;
	}
	try {
		await removePreviousInstallations(jsonBody.installationId)
	} catch (err) {
		console.error(`[setupHandler] Unable to remove previous installations for ${jsonBody.installationId}`, err);
		res.status(500).json({ "error": "Internal Server Error" });
		return;
	}
	// get user_id for the given install_id
	const userId = await getUserIdByTopicName(jsonBody.installationId).catch((error: any) => {
		console.error("[setupHandler/getUserIdByTopicName] Failed to fetch userId from the database.", error);
		res.status(500).json({ "error": "Internal Server Error" });
		return;
	});
	if (!userId) {
		console.error(`[setupHandler/getUserIdByTopicName] NO userId found for topic name: ${jsonBody.installationId} from database.`);
		res.status(404).json({ "error": "No userId found for given installationId" });
		return;
	}
	const allSetupReposPromises = [];
	for (const ownerInfo of jsonBody.info) {
		let setupReposArgs: SetupReposArgs = {
			repo_owner: ownerInfo.owner,
			repo_provider: ownerInfo.provider,
			repo_names: ownerInfo.repos,
			install_id: jsonBody.installationId
		}
		const saveSetupReposPromises = saveSetupReposInDb(setupReposArgs)
			.catch((err) => {
				console.error("[setupHandler] Unable to save setup info, ", err);
			});
		allSetupReposPromises.push(saveSetupReposPromises);
	}
	await Promise.all(allSetupReposPromises).then(async (values) => {
		console.info("[setupHandler] All setup info saved succesfully...")
		// for repos in ownerInfo, save default repo_config value in repo_config table
		for (const ownerInfo of jsonBody.info) {
			await insertRepoConfig(ownerInfo.owner, ownerInfo.repos, userId, ownerInfo.provider)
			.then((queryResponse: any) => {
				if (queryResponse) {
					console.info(`[setupHandler/insertRepoConfigOnSetup] repo config info saved succesfully for repos: ${ownerInfo.repos} for owner: ${ownerInfo.owner}`);
				}
				else {
					console.error(`[setupHandler/insertRepoConfigOnSetup] Failed to save repo config info for repos: ${ownerInfo.repos} for owner: ${ownerInfo.owner}`);
				}
			})
			.catch((error: Error) => {
				console.error(`[setupHandler/insertRepoConfigOnSetup] Failed to save repo config for repos: ${ownerInfo.repos} for owner: ${ownerInfo.owner}`, error);
			})
		}
		res.status(200).send("Ok");
		return;
	}).catch((error) => {
		console.error("[setupHandler] Unable to save all setup info in db, error: ", error);
		res.status(500).json({ "error": "Unable to save setup info" });
		return;
	});
}

export default setupHandler;
