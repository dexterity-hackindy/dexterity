# Dexterity - Sign Language Translator
#### Video Demo: <Link-When-Available>
#### Try it: https://dexterity-hackindy.github.io/dexterity

> [!NOTE]
> When you first open the site, the recognition model might take a while to load.

#### Description: Dexterity is a real-time Sign Language translator and learning tool that uses your webcam to recognize hand shapes and convert them into text and speech.

## Usage Instructions
<img width="1332" height="937" alt="Dexterity Landing Page" align="center" src="https://github.com/user-attachments/assets/6cf69558-35ee-42ea-a5e2-a771583ab4cf" />

### Getting Started
Initialize the Camera: When you first open the site, click the "Start Camera" button. You may need to grant your browser permission to access your webcam.

Calibration: Once the camera is on, ensure your hand is clearly visible within the frame. The system uses MediaPipe technology to track your hand landmarks in real-time.

### Translating Signs (Letters & Numbers)
Sign into the Camera: Perform a hand shape (e.g., an ASL letter). The "Recent Signs" and "Session Stats" panels will show what the AI currently detects and its confidence level.

<img width="1332" height="937" alt="Dexterity Usage Demo" align="center" src="https://github.com/user-attachments/assets/0f317bd4-2496-4fc7-bc06-c80c1730f82f" />


Hold Duration: To prevent accidental inputs, you usually need to hold a sign for a brief period (users can choose a time ranging from 0.3s to 3s) for it to be "captured."

Mode Selection: You can toggle between different modes like Letters, Numbers, or Custom depending on what you want to translate.

### Using the Sentence Builder
As you sign, the letters are added to the Sentence Builder text box.

Editing: Use the Space, Backspace, and Clear buttons to manage your text.

Speak: Click the 🔊 Speak button to have the computer read your translated sentence aloud using text-to-speech.

Copy: Use the Copy button to quickly save your text to your clipboard.

### Training Custom Signs
Dexterity allows you to train the AI on your own specific hand shapes:

Unlock Training: Click on the Training Data section. Note that this may require a password if the developers have locked the training panel for specific sessions.

Add Samples: Select a label (like "A" or a "Custom" word), perform the sign, and click Save Sample.

Custom Labels: You can add entirely new words to the library by typing them into the Custom Labels box and then recording samples for them.

![Dexterity Custom Demo](https://github.com/user-attachments/assets/7b9f8241-aaec-4f7c-aea9-61b128debd28)

## Viewer
<img width="1332" height="937" alt="Dexterity Viewer" align="center" src="https://github.com/user-attachments/assets/3bdd1495-8951-4b02-8009-0c4b50c1412a" />

The Dexterity Training Viewer acts as the management console for the hand-sign data you've collected. Since this page handles the underlying training samples, it provides tools to inspect, back up, and manage the dataset stored in your browser's local database (IndexedDB).

### Accessing the Viewer
Unlock: Enter the password (asl1234) into the password field and click Unlock →. This grants access to the data management tools.

### Managing Training Data
Refresh: If you have just added new signs in the main application, use the Refresh button to update the viewer with the most recent samples.

Delete All: This permanently clears all training samples from your browser's local storage. Use this with caution if you want to start your dataset from scratch.

### Inspecting Samples
The viewer categorizes data into three main sections:

**Letters A–Z**: View the specific landmark data captured for each alphabet sign.

**Numbers 0–9**: View the data for numeric signs.

**Custom Labels**: This section displays samples for any custom words or phrases you have trained.

> [!NOTE]
> Custom labels are session-based in the main app, so while the samples are saved here, you’ll need to re-add the label name in the main app to use them for live translation.

**Show All**: Expand this to see a comprehensive list of every sample currently in the database.

### Portability (Export & Import)
Session data is stored locally in your browser. To continue where you left off, make sure to use the Export & Import buttons in the viewer.

**Export JSON**: Saves your entire training dataset as a JSON file. This is highly recommended for creating backups or moving your trained model to a different computer.

**Import JSON**: Allows you to upload a previously exported JSON file to restore your signs or merge them with another dataset.

## Dexter
<img width="1332" height="937" alt="Dexter" align="center" src="https://github.com/user-attachments/assets/e422d306-6a49-4a6b-a0d9-4623311282b6" />

Dexter is our interactive Sign Language hand-shape guide that lives within the app. While the AI tracks 21 hand landmarks in 3D space, Dexter provides the visual reference users need to improve their accuracy.

## What's Next?
Users will be able to create their accounts and log in to them to access the specific data that they have trained their model on. Eventually, users of Dexterity will be able to communicate with each other through Dexterity as a platform similar to Omegle, Google Meet, or the like.

### Happy Hacking!
