const fs = require('fs');

function fixFile(path) {
  let content = fs.readFileSync(path, 'utf8');

  // General term replacements
  content = content.replace(/Hard Flags?/gi, "Physical/Statistical Rejects");
  content = content.replace(/Soft Flags?/gi, "Statistical Warnings");
  content = content.replace(/Hard\/Soft flag/gi, "Physical/Statistical flag");
  content = content.replace(/HARD SIGNAL/gi, "REJECT DECISION (>= 1 Physical or >= 2 Statistical)");
  content = content.replace(/SOFT SIGNAL/gi, "WARNING DECISION (< 2 Statistical)");
  content = content.replace(/Hard Reject/gi, "Reject");
  content = content.replace(/Soft Reject/gi, "Warning");
  content = content.replace(/hard flag/gi, "reject decision");
  content = content.replace(/soft flag/gi, "statistical signal");
  content = content.replace(/anticheat\.hard_reject/g, "anticheat.round_rejected");
  content = content.replace(/anticheat_hard/g, "anticheat_rejected");
  content = content.replace(/Soft hay Hard Reject/gi, "Reject hay Warning");
  content = content.replace(/dính hard flag/gi, "bị reject");
  content = content.replace(/mức phạt từ Hard -> Soft/gi, "mức phạt từ Reject -> Warning");
  content = content.replace(/từng hard flag/gi, "từng flag");

  // Undo accidental replacements on "hard" difficulty
  content = content.replace(/difficulty === "Reject/g, 'difficulty === "hard');
  content = content.replace(/Perfect Reject/g, 'Perfect hard');

  fs.writeFileSync(path, content);
}

fixFile('docs/feature_anticheat_observability.txt');
fixFile('docs/feature_games_scoring.txt');

console.log('Fixed hard/soft in docs');
