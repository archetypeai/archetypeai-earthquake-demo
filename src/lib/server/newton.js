import { ATAI_API_KEY, ATAI_API_ENDPOINT } from '$env/static/private';

const API_VERSION = 'v0.5';
const MODEL = 'Newton::c2_5_8b_260413b723a9ab';

const SYSTEM_PROMPT =
	'You are a seismology AI assistant analyzing real-time USGS earthquake data. ' +
	'You help users understand current seismic activity patterns, identify aftershock sequences, ' +
	'regional clustering, and assess whether activity levels are normal or elevated. ' +
	'Be precise with magnitudes and locations. When analyzing patterns, consider: ' +
	'spatial clustering (earthquakes near each other may be related), temporal patterns ' +
	'(aftershock sequences follow large events), and depth variations. ' +
	'Magnitude scale context: M<2 (micro, not felt), M2-4 (minor/light), M4-5 (moderate, felt widely), ' +
	'M5-6 (strong, potential damage), M6-7 (major), M7+ (great, significant damage).';

export async function queryNewton(query) {
	const url = `${ATAI_API_ENDPOINT.replace(/\/$/, '')}/${API_VERSION}/query`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 120000);

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${ATAI_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query,
				system_prompt: SYSTEM_PROMPT,
				instruction_prompt: SYSTEM_PROMPT,
				file_ids: [],
				model: MODEL,
				max_new_tokens: 1024,
				sanitize: false
			}),
			signal: controller.signal
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(`Newton query failed: ${res.status} - ${JSON.stringify(err)}`);
		}

		const data = await res.json();

		// Extract text from response
		if (data?.response?.response) {
			const r = data.response.response;
			if (Array.isArray(r)) return r[0];
			if (typeof r === 'string') return r;
		}
		if (Array.isArray(data?.response)) return data.response[0];
		if (typeof data?.response === 'string') return data.response;
		if (typeof data?.text === 'string') return data.text;

		return JSON.stringify(data);
	} finally {
		clearTimeout(timeoutId);
	}
}
