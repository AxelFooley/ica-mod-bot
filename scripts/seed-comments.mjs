import { readFileSync } from 'fs';
import { homedir } from 'os';

const POST_ID = '1s4z5ib'; // test2 post — change this to a fresh post each run
const SUBREDDIT = 'ica_mod_bot_dev';
const COMMENT_COUNT = 5;

const tokenFile = JSON.parse(readFileSync(`${homedir()}/.devvit/token`, 'utf8'));
const { accessToken } = JSON.parse(Buffer.from(tokenFile.token, 'base64').toString('utf8'));

const COMMENTS = [
  "Ottimo punto, grazie per la condivisione!",
  "Sono completamente d'accordo con questo.",
  "Interessante prospettiva, non ci avevo mai pensato.",
  "Qualcuno ha esperienza diretta con questa situazione?",
  "Questo mi è successo esattamente lo scorso anno.",
  "Dipende molto dal settore in cui lavori.",
  "In Italia funziona diversamente rispetto al Nord Europa.",
  "Utile! Lo condividerò con i colleghi.",
  "Hai considerato anche l'opzione del freelance?",
  "Il mercato del lavoro italiano è complicato da navigare.",
  "Molto utile per chi è all'inizio della carriera.",
  "Concordo, ma aggiungerei anche l'importanza del networking.",
  "La mia esperienza è stata molto diversa, ogni caso è unico.",
  "Grazie per questo post, molto informativo.",
  "Hai fonti per queste affermazioni?",
  "Ho passato la stessa situazione, posso capire.",
  "Dipende anche dall'azienda, non solo dal settore.",
  "In quale città sei? Le opportunità variano molto.",
  "Buon punto, spesso si sottovaluta questo aspetto.",
  "Anche la dimensione dell'azienda conta molto.",
  "Hai provato a consultare un career coach?",
  "Il telelavoro ha cambiato molto le dinamiche.",
  "Quanti anni di esperienza hai in questo campo?",
  "Interessante, seguo questa community proprio per questi post.",
  "Stessa cosa mi è capitata in una PMI italiana.",
  "I colloqui in Italia spesso non rispettano i tempi dichiarati.",
  "Il contratto a tempo indeterminato è ancora un miraggio?",
  "Meglio puntare sulle competenze tecniche o sulle soft skill?",
  "Anche la lingua inglese fa molta differenza ora.",
  "Ho cambiato tre lavori in due anni, normale ormai.",
  "Il welfare aziendale è sempre più importante nella scelta.",
  "RAL o RAL + benefit? Cosa consigliate di negoziare?",
  "Ogni recruiter ha la sua idea di 'urgente'.",
  "Quante interviste prima di ricevere un'offerta? Troppo lungo il processo.",
  "Meglio LinkedIn o Glassdoor per il mercato italiano?",
  "Il ghosting dei recruiter è un problema reale.",
  "Ho aspettato tre mesi per un feedback. Assurdo.",
  "Le startup pagano meno ma danno più responsabilità.",
  "Le grandi aziende pagano di più ma sono più burocratiche.",
  "Esatto, il problema è la trasparenza sugli stipendi.",
  "In Germania funziona molto diversamente, ho confrontato.",
  "Hai mai usato un headhunter? Ha funzionato?",
  "Il settore tech è in crisi o ci sono ancora opportunità?",
  "Dipende molto dalla specializzazione, in data science va meglio.",
  "Marketing digitale: saturato o ancora spazio per crescere?",
  "La formazione continua è essenziale, concordo.",
  "Meglio una certificazione o un master per la carriera?",
  "Il MBA vale ancora la pena in Italia?",
  "Università statale o privata cambia qualcosa nel CV?",
  "Esperienza all'estero: quanto peso dà ai selezionatori?",
  "Tornare in Italia dopo l'estero è sempre una sfida.",
  "Il problema del brain drain è reale e doloroso.",
  "Concordo, ma qualcosa sta cambiando lentamente.",
  "La Gen Z ha aspettative diverse, giusto o sbagliato?",
  "Work-life balance: finalmente se ne parla apertamente.",
  "Lo smart working pieno non tornerà più, secondo me.",
  "Il 'quiet quitting' è una risposta razionale a certi ambienti.",
  "Il burnout è più diffuso di quanto si ammetta.",
  "Fondamentale avere chiari i propri valori prima di cercare lavoro.",
  "Grazie, post salvato per rileggerlo con calma.",
  "Qualcuno ha esperienza nel passaggio da dipendente a imprenditore?",
  "La partita IVA in Italia è un labirinto burocratico.",
  "Forfettario o ordinario? Dipende dai numeri, ovviamente.",
  "Il settore pubblico: ancora attrattivo o è un'illusione?",
  "Il concorso pubblico richiede anni di preparazione.",
  "Meglio il privato per chi vuole crescere velocemente.",
  "La meritocrazia esiste in Italia? Dipende dall'azienda.",
  "Ho trovato lavoro tramite conoscenza, purtroppo è ancora così.",
  "Il nepotismo è ancora troppo diffuso.",
  "Le raccomandazioni però non bastano senza competenze.",
  "Stai considerando anche il settore no-profit?",
  "Il terzo settore paga meno ma dà più soddisfazioni.",
  "Dipende dai propri obiettivi di vita, non solo di carriera.",
  "Post utilissimo, grazie a tutti per i commenti.",
  "Speriamo che il mercato migliori nei prossimi anni.",
  "Ottima discussione, ho imparato qualcosa di nuovo oggi.",
];

async function postComment(text, index) {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ica-mod-bot-seed/1.0',
    },
    body: new URLSearchParams({
      api_type: 'json',
      thing_id: `t3_${POST_ID}`,
      text,
    }),
  });

  const data = await res.json();
  if (data?.json?.errors?.length) {
    console.error(`Comment ${index + 1} failed:`, data.json.errors);
  } else {
    console.log(`✓ Comment ${index + 1}/${COMMENT_COUNT}: "${text.slice(0, 40)}..."`);
  }

  // Reddit limits rapid same-account comments — 10s gap is safe
  await new Promise(r => setTimeout(r, 10000));
}

console.log(`Posting ${COMMENT_COUNT} comments to t3_${POST_ID} in r/${SUBREDDIT}...\n`);
for (let i = 0; i < COMMENT_COUNT; i++) {
  await postComment(COMMENTS[i % COMMENTS.length], i);
}
console.log('\nDone! The bot trigger should fire shortly.');
