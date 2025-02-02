#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deepseek } from "@ai-sdk/deepseek";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { config } from "dotenv";
import inquirer from "inquirer";
import minimist from "minimist";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

const model = "deepseek";

if (
	(model === "openai" && !process.env.OPENAI_API_KEY) ||
	(model === "deepseek" && !process.env.DEEPSEEK_API_KEY)
) {
	console.error(
		`Please set the ${model === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY"} environment variable.`,
	);
	process.exit(1);
}

const modelProvider =
	model === "openai" ? openai("gpt-3.5-turbo") : deepseek("deepseek-chat");

const args = minimist(process.argv.slice(2), {
	string: ["w", "n"],
	boolean: ["flashcards"],
	alias: { w: "words", n: "numPhrases", flashcards: "f" },
});

const words = args.w ? args.w.split(",") : [];
const numPhrases = args.n ? Number.parseInt(args.n, 10) : 5;
const flashcards = args.flashcards || false;

if (words.length === 0) {
	console.error(
		"No words provided. Please provide a list of words using the -w flag.",
	);
	process.exit(1);
}

if (Number.isNaN(numPhrases) || numPhrases <= 0) {
	console.error("Please provide a valid number of phrases using the -n flag.");
	process.exit(1);
}

async function generatePhrases(word, numPhrases) {
	const { object } = await generateObject({
		model: modelProvider,
		schema: z.object({
			phrases: z.array(z.string()),
		}),
		prompt: `Generate ${numPhrases} natural, contextually relevant phrases that native English speakers might use in daily life, incorporating the word "${word}" in a meaningful way.`,
	});

	return object.phrases;
}

async function translatePhrase(phrase) {
	const { object } = await generateObject({
		model: modelProvider,
		schema: z.object({
			translation: z.string(),
		}),
		prompt: `Translate the following phrase into natural, idiomatic Portuguese that a native speaker would use: "${phrase}"`,
	});

	return object.translation;
}

async function getWordMeaning(word) {
	const { object } = await generateObject({
		model: modelProvider,
		schema: z.object({
			meaning: z.string(),
		}),
		prompt: `Provide the meaning of the word "${word}" in English.`,
	});

	return object.meaning;
}

async function main() {
	const selectedPhrases = [];

	for (const word of words) {
		const meaning = await getWordMeaning(word);
		console.log(`\nMeaning of "${word}": ${meaning}\n`);

		const phrases = await generatePhrases(word, numPhrases);

		const { chosenPhrases } = await inquirer.prompt([
			{
				type: "checkbox",
				name: "chosenPhrases",
				message: `Choose phrases for the word "${word}":`,
				choices: phrases.map((phrase) => ({ name: phrase, value: phrase })),
			},
		]);

		selectedPhrases.push(
			...chosenPhrases.map((phrase) => ({ phrase, meaning, word })),
		);
	}

	const translations = await Promise.all(
		selectedPhrases.map(async ({ phrase, meaning, word }) => {
			const translation = await translatePhrase(phrase);
			return { english: phrase, portuguese: translation, meaning, word };
		}),
	);

	const outputContent = translations
		.map(
			(pair) =>
				`Meaning: ${pair.meaning}\nEnglish: ${pair.english}\nPortuguese: ${pair.portuguese}`,
		)
		.join("\n\n");

	console.log("\nFinal Output:\n");
	console.log(outputContent);

	if (flashcards) {
		const flashcardsContent = [
			"#separator:tab",
			"#html:true",
			"#tags column:3",
			...translations.map(
				(pair) =>
					`"${pair.english} <b><span style="color: rgb(0, 0, 255);">${pair.word}</span></b>"\t${pair.meaning}`,
			),
		].join("\n");

		fs.writeFileSync("flashcards.txt", flashcardsContent);
		console.log('\nFlashcards file "flashcards.txt" has been generated.\n');
	}
}

main().catch((error) => {
	console.error("An error occurred:", error);
	process.exit(1);
});
