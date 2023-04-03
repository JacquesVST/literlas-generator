import * as vscode from 'vscode';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {

	const generate = vscode.commands.registerCommand('literal-generator.generate', async () => {
		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			return;
		}

		// Get selected text
		const originalSelection = editor.document.getText(editor.selection)?.trim() ?? '';

		let termValue = originalSelection;
		let selectedWithQuotes: boolean;

		// Check if either single or double quotes are surrounding selection
		if ((originalSelection?.startsWith("'") || originalSelection?.startsWith('"')) &&
			(originalSelection?.endsWith("'") || originalSelection?.endsWith('"'))) {
			termValue = termValue.slice(1).slice(0, -1);
			selectedWithQuotes = true;
		}

		if (termValue) {
			// If selection is valid, show this message as progress indication
			vscode.window.showInformationMessage('Generating literals for: "' + termValue + '"...');

			// Ask user which object is this term a part of and what should be the property name
			const objectTermQuery = await vscode.window.showInputBox({
				placeHolder: 'object.term',
				prompt: 'New or existing object and term property name',
				value: ''
			});

			const objectTermRegex = RegExp('\\w+\\.\\w+');
			if (objectTermQuery && objectTermRegex.test(objectTermQuery ?? '')) {
				// If the requested names follow the "object.term" RegEx, save them individually
				const targetObject = objectTermQuery.split('.')[0];
				const targetTerm = objectTermQuery.split('.')[1];

				// Find which module the source value is from
				let path = editor.document.fileName.split('\\');
				if (path.length === 1){
					path = editor.document.fileName.split('/');
				}
				
				
				let indexOfModule = path.indexOf('libs');
				if (indexOfModule === -1) {
					indexOfModule = path.indexOf('modules');
				}
				const module = path[indexOfModule + 1];

				// Find which files will have to be updated
				const literalsFile = await vscode.workspace.findFiles(`**/${module}/**/literals.ts`, '**/node_modules/**')
				const idiomFiles = await vscode.workspace.findFiles(`**/${module}/**/{en,es,pt}.json`, '**/node_modules/**')

				if (literalsFile.length > 0) {
					// If the i18n files were found, start updating the objects
					vscode.workspace.openTextDocument(literalsFile[0]).then(content => {
						let contentText = content.getText();
						const indexOfTarget = contentText.indexOf(targetObject + '!:')

						if (indexOfTarget !== -1) {
							const indexForInsertion = contentText.indexOf('}', indexOfTarget);
							contentText = contentText.slice(0, indexForInsertion) + `    ${targetTerm}: any;\n    ` + contentText.slice(indexForInsertion);
						} else {
							const indexForInsertion = contentText.lastIndexOf('}');
							contentText = contentText.slice(0, indexForInsertion) + `\n    ${targetObject}!: {\n        ${targetTerm}: any;\n    };\n` + contentText.slice(indexForInsertion);
						}

						// Couldn't convert a .ts file content string to a valid JSON and convert back to ensure object rules, check the affeceted literals.ts for inconsistencies

						fs.writeFileSync(content.fileName, contentText);
					});

					// Updates the JSON of each idiom file with JSON conversion to object
					idiomFiles.forEach(idiomFile => {
						vscode.workspace.openTextDocument(idiomFile).then(content => {
							const contentJSON = JSON.parse(content.getText());

							if (contentJSON[targetObject]) {
								Object.assign(contentJSON[targetObject], { [targetTerm]: termValue })
							} else {
								Object.assign(contentJSON, { [targetObject]: { [targetTerm]: termValue } })
							}

							const sorted = sortJSON(contentJSON)

							fs.writeFileSync(content.fileName, JSON.stringify(sorted, null, 2));
						});
					});

					// Replaces selected text with new term
					editor.edit(editBuilder => {
						const newValue = `this.i18n.${targetObject}.${targetTerm}`;

						if (selectedWithQuotes) {
							editBuilder.replace(editor.selection, newValue);
						} else {
							// If it's possible that the selection did not include quotation marks, extend the selection by 1 character before and after
							const range = new vscode.Range(editor.selection.start.translate(0, -1), editor.selection.end.translate(0, 1));
							editBuilder.replace(range, newValue)
						}
					}).then();
				} else {
					vscode.window.showErrorMessage('No i18n path was found for this module/lib');
				}
			} else {
				vscode.window.showErrorMessage('Please inform the new object and term properties (i.e., geral.dataHora)');
			}
		} else {
			vscode.window.showErrorMessage('Literals for: "' + originalSelection + '" cannot be generated');
		}
	});
	context.subscriptions.push(generate);
}

export function deactivate() { }

function sortJSON(object: any) {
	if (object instanceof Array) {
		for (let i = 0; i < object.length; i++) {
			object[i] = sortJSON(object[i]);
		}
		return object;
	} else if (typeof object != "object") return object;

	let keys = Object.keys(object);
	keys = keys.sort();
	const newObject = {};
	for (var i = 0; i < keys.length; i++) {
		const property = keys[i] as keyof Object;
		newObject[property] = sortJSON(object[keys[i]])
	}
	return newObject;
}
