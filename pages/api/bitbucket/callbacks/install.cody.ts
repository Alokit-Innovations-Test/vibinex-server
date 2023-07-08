import { NextApiRequest, NextApiResponse } from 'next';
import { publishMessage } from '../../../../utils/pubsub/pubsubClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const topicName = 'rtapish-fromserver';
  const data = Buffer.from(JSON.stringify(req.body));
  const msgtype = 'bb_install_callback';

  try {
    await publishMessage(topicName, data, msgtype);
  } catch (error) {
    console.error('Error publishing message:', error);
    res.status(500).json({ error: '<failure>Failed to publish message.</failure>' });
  }
}  

