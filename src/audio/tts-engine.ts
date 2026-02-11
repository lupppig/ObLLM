export interface TTSEngine {
	speak(text: string): Promise<void>;
	stop(): void;
	readonly isPlaying: boolean;
}

// ── Browser TTS (Web Speech API) ──

export class BrowserTTS implements TTSEngine {
	private utterance: SpeechSynthesisUtterance | null = null;
	private _isPlaying = false;
	private voice: string;
	private speed: number;

	constructor(voice = '', speed = 1.0) {
		this.voice = voice;
		this.speed = speed;
	}

	async speak(text: string): Promise<void> {
		this.stop();

		return new Promise((resolve, reject) => {
			const utterance = new SpeechSynthesisUtterance(text);
			utterance.rate = this.speed;

			if (this.voice) {
				const voices = window.speechSynthesis.getVoices();
				const match = voices.find(
					(v) => v.name.toLowerCase().includes(this.voice.toLowerCase())
				);
				if (match) utterance.voice = match;
			}

			utterance.onstart = () => { this._isPlaying = true; };
			utterance.onend = () => { this._isPlaying = false; resolve(); };
			utterance.onerror = (e) => { this._isPlaying = false; reject(e); };

			this.utterance = utterance;
			window.speechSynthesis.speak(utterance);
		});
	}

	stop(): void {
		window.speechSynthesis.cancel();
		this._isPlaying = false;
		this.utterance = null;
	}

	get isPlaying(): boolean {
		return this._isPlaying;
	}
}

// ── Gemini TTS ──

export class GeminiTTS implements TTSEngine {
	private apiKey: string;
	private voice: string;
	private speed: number;
	private _isPlaying = false;
	private audioEl: HTMLAudioElement | null = null;

	constructor(apiKey: string, voice = 'Kore', speed = 1.0) {
		this.apiKey = apiKey;
		this.voice = voice;
		this.speed = speed;
	}

	async speak(text: string): Promise<void> {
		this.stop();
		this._isPlaying = true;

		try {
			const body = {
				contents: [{ parts: [{ text }] }],
				generationConfig: {
					responseModalities: ['AUDIO'],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: { voiceName: this.voice },
						},
					},
				},
				model: 'gemini-2.5-flash-preview-tts',
			};

			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${this.apiKey}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				}
			);

			if (!response.ok) {
				throw new Error(`Gemini TTS error: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();
			const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
			const mimeType = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/mp3';

			if (!audioData) {
				throw new Error('Gemini TTS returned no audio data');
			}

			// Decode base64 audio and play
			const binary = atob(audioData);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			const blob = new Blob([bytes], { type: mimeType });
			const url = URL.createObjectURL(blob);

			await this.playAudioUrl(url);
		} catch (err) {
			this._isPlaying = false;
			throw err;
		}
	}

	stop(): void {
		if (this.audioEl) {
			this.audioEl.pause();
			this.audioEl.src = '';
			this.audioEl = null;
		}
		this._isPlaying = false;
	}

	get isPlaying(): boolean {
		return this._isPlaying;
	}

	private playAudioUrl(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(url);
			audio.playbackRate = this.speed;
			this.audioEl = audio;

			audio.onended = () => {
				this._isPlaying = false;
				URL.revokeObjectURL(url);
				resolve();
			};
			audio.onerror = (e) => {
				this._isPlaying = false;
				URL.revokeObjectURL(url);
				reject(e);
			};
			audio.play().catch(reject);
		});
	}
}

// ── OpenAI TTS ──

export class OpenAITTS implements TTSEngine {
	private apiKey: string;
	private voice: string;
	private speed: number;
	private model: string;
	private _isPlaying = false;
	private audioEl: HTMLAudioElement | null = null;

	constructor(apiKey: string, voice = 'alloy', speed = 1.0, model = 'tts-1') {
		this.apiKey = apiKey;
		this.voice = voice;
		this.speed = speed;
		this.model = model;
	}

	async speak(text: string): Promise<void> {
		this.stop();
		this._isPlaying = true;

		try {
			const response = await fetch('https://api.openai.com/v1/audio/speech', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: this.model,
					input: text,
					voice: this.voice,
					speed: this.speed,
					response_format: 'mp3',
				}),
			});

			if (!response.ok) {
				throw new Error(`OpenAI TTS error: ${response.status} ${response.statusText}`);
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			await this.playAudioUrl(url);
		} catch (err) {
			this._isPlaying = false;
			throw err;
		}
	}

	stop(): void {
		if (this.audioEl) {
			this.audioEl.pause();
			this.audioEl.src = '';
			this.audioEl = null;
		}
		this._isPlaying = false;
	}

	get isPlaying(): boolean {
		return this._isPlaying;
	}

	private playAudioUrl(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const audio = new Audio(url);
			this.audioEl = audio;

			audio.onended = () => {
				this._isPlaying = false;
				URL.revokeObjectURL(url);
				resolve();
			};
			audio.onerror = (e) => {
				this._isPlaying = false;
				URL.revokeObjectURL(url);
				reject(e);
			};
			audio.play().catch(reject);
		});
	}
}

// ── Factory ──

export function createTTSEngine(
	provider: 'browser' | 'gemini' | 'openai',
	apiKey: string,
	voice: string,
	speed: number
): TTSEngine {
	switch (provider) {
		case 'gemini':
			return new GeminiTTS(apiKey, voice || 'Kore', speed);
		case 'openai':
			return new OpenAITTS(apiKey, voice || 'alloy', speed);
		default:
			return new BrowserTTS(voice, speed);
	}
}
