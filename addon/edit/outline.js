// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  var listRE = /^(\s*)(>[> ]*|[*+-]\s|(\d+)([.)]))(\s*)/,
      emptyIndentedListRE = /^(\s+)(>[> ]*|[*+-]|(\d+)[.)])(\s*)$/,
      emptyListRE = /^(>[> ]*|[*+-]|(\d+)[.)])(\s*)$/,
      unorderedListRE = /[*+-]\s/,
      emptyLineRE = /^(\s*)$/;

    CodeMirror.commands.indentMarkdownListMore = function(cm) {

        if (cm.getOption("disableInput")) return CodeMirror.Pass;

        // doc.listSelections():
        // Retrieves a list of all current selections. These will always be sorted, and never overlap (overlapping selections are merged). 
        // Each object in the array contains anchor and head properties referring to {line, ch} objects.
        var ranges = cm.listSelections(), replacements = [];

        // Go over all the selected lines
        for (var i = 0; i < ranges.length; i++) {
            // First line of the selection
            var pos = ranges[i].head;

            // Check the state AFTER the line
            var eolState = cm.getStateAfter(pos.line);
            var inList = eolState.list !== false;
            var inQuote = eolState.quote !== 0;

            // Debug
            var eolStatePrev = cm.getStateAfter(pos.line - 1);
            console.log("Indentation: " + eolStatePrev.indentation + ", diff: " + eolStatePrev.indentationDiff + ", indent: " + eolStatePrev.indent);
            console.log(eolStatePrev);
            console.log(eolState);

            // Get the line's text and check if it's a list
            var line = cm.getLine(pos.line), match = listRE.exec(line);
            
            if (emptyLineRE.exec(line)) {
                console.log("Starting new list");
                replacements[i] = "-\t";     // TODO: Probably there's a function generating proper tab size
            }
            else if (match) {
                console.log("Increasing list indent");
                cm.execCommand("indentMore");
                return;
            }
            else return CodeMirror.Pass;
        }

        cm.replaceSelections(replacements);
    };

    CodeMirror.commands.newlineAndIndentContinueMarkdownList = function(cm) {

        if (cm.getOption("disableInput")) return CodeMirror.Pass;

        // doc.listSelections():
        // Retrieves a list of all current selections. These will always be sorted, and never overlap (overlapping selections are merged). 
        // Each object in the array contains anchor and head properties referring to {line, ch} objects.
        var ranges = cm.listSelections(), replacements = [];

        // Go over all the selected lines
        for (var i = 0; i < ranges.length; i++) {
            // First line of the selection
            var pos = ranges[i].head;

            // Check the state AFTER the line
            var eolState = cm.getStateAfter(pos.line);
            var inList = eolState.list !== false;
            var inQuote = eolState.quote !== 0;

            // Get the line's text and check if it's a list
            var line = cm.getLine(pos.line), match = listRE.exec(line);

            // In case line is NOT a list, just continue
            if (!ranges[i].empty() || (!inList && !inQuote) || !match) {
                console.log("No list, bailing out");
                cm.execCommand("newlineAndIndent");
                return;
            }


            if (emptyIndentedListRE.test(line)) {
                console.log("Empty indented line, decreasing indent");
                cm.execCommand("indentLess");
                return;
            }
            else if (emptyListRE.test(line)) {
                cm.replaceRange("", {
                    line: pos.line, ch: 0
                }, {
                    line: pos.line, ch: pos.ch + 1
                });
                replacements[i] = "\n";
            } 
            else {
                var indent = match[1], after = match[5];
                var bullet = unorderedListRE.test(match[2]) || match[2].indexOf(">") >= 0
                ? match[2]
                : (parseInt(match[3], 10) + 1) + match[4];

                replacements[i] = "\n" + indent + bullet + after;
            }
        }

        cm.replaceSelections(replacements);
    };

});
