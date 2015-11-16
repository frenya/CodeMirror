// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

/*                 

-   f  (function used to return next token)
    -   inlineNormal
    -   state.inline
    -   state.block
    -   local
    -   leavingLocal
    -   linkHref
    -   linkInline
    -   getLinkHrefInside(ch === "(" ? ")" : "]")
    -   footnoteLink
    -   footnoteLinkInside
    -   footnoteUrl
    
-   block (used only as value for .f at times, checked for htmlBlock value at times)
    -   blockNormal
    -   local
    -   leavingLocal
    -   htmlBlock

-   thisLine - either null or this line's stream
-   prevLine - either null or previous value of thisLine

-   htmlState - state of the HTML parser

-   indentation - indentation (in spaces) of the current line, rounded to multiples of 4, does not count bullet or indented code's spaces
-   indentationDiff - difference (in spaces) against previous line
-   listDepth - basically (indentation / 4)

-   list
    -   true for the bullet point token
    -   null anywhere else on the list's line
    -   false if not a list at all
    -   NOTE: Hence the use of the (state.list !== false) condition

    localMode: s.localMode,
    localState: s.localMode ? CodeMirror.copyState(s.localMode, s.localState) : null,

    inline: s.inline,
    text: s.text,
    formatting: false,
    linkTitle: s.linkTitle,
    code: s.code,
    em: s.em,
    strong: s.strong,
    strikethrough: s.strikethrough,
    header: s.header,
    hr: s.hr,
    taskList: s.taskList,
    list: s.list,
    quote: s.quote,
    indentedCode: s.indentedCode,
    trailingSpace: s.trailingSpace,
    trailingSpaceNewLine: s.trailingSpaceNewLine,
    md_inside: s.md_inside,
    fencedChars: s.fencedChars

*/

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
    
    
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Outline CRLF

    CodeMirror.commands.outlineMarkdownListNewLine = function(cm) {

        if (cm.getOption("disableInput")) return CodeMirror.Pass;

        // doc.listSelections():
        // Retrieves a list of all current selections. These will always be sorted, and never overlap (overlapping selections are merged). 
        // Each object in the array contains anchor and head properties referring to {line, ch} objects.
        var ranges = cm.listSelections(), replacements = [];
        // console.log(ranges);

        // Go over all the selected lines
        for (var i = 0; i < ranges.length; i++) {
            
            var replacementString = newLineReplacementForRange(ranges[i], cm);
            if (replacementString == undefined) {
                cm.execCommand("newlineAndIndent");
                return;
            }
            
            replacements[i] = replacementString;
            
        }
        
        cm.replaceSelections(replacements);
        
    }
    
    /**
    * @param {Range} range One of the selection ranges
    */
    function newLineReplacementForRange(range, cm) {
        
        console.log(range);
        
        // Using functions here instead of head/anchor to make sure fromPos <= toPos
        var fromPos = range.from();
        var toPos = range.to();

        var fromState = getStateAt(fromPos, cm);
        var toState = getStateAt(toPos, cm);
        
        console.log(fromState, toState);

        // The selection may end outside a list, but must start inside a list,
        // dtto for quote
        var inList = fromState.list !== false;
        var inQuote = fromState.quote !== 0;

        // Get the first line's text and check if it's a list
        var line = cm.getLine(fromPos.line), match = listRE.exec(line);

        // -----------------------------------------
        // In case line is NOT a list, ignore and quit
        if (/*!range.empty() ||*/ (!inList && !inQuote) || !match) {
            console.log("No list, bailing out");
            return undefined;
        }
        
        // -----------------------------------------
        // Everything is OK, so perform one of the following
        // - continue list
        // - decrease indent
        // - remove bullet and insert blank line

        // First we have to check if it's time to decrease indent,
        // i.e. selection starts right after bullet and ends at an eol (even of different line)
        var endLine = cm.getLine(toPos.line);
        if ((fromPos.ch == match[0].length) && (toPos.ch == endLine.length)) {
            console.log("Pressed Return right after bullet");
            if (fromState.indentation > 0) {
                console.log("Decreasing indent");
                cm.indentLine(fromPos.line, "subtract");
                return "";
            }
            else {
                cm.replaceRange("", 
                                { line: fromPos.line, ch: 0 }, 
                                { line: toPos.line, ch: toPos.ch + 1 });    // Not sure why the +1
                return "\n";
            } 
        }
        else {
            var indent = match[1], after = match[5];
            var bullet = unorderedListRE.test(match[2]) || match[2].indexOf(">") >= 0
            ? match[2]
            : (parseInt(match[3], 10) + 1) + match[4];

            return "\n" + indent + bullet + after;
        }
        
    };

    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Supporting functions

    // TODO: Minify
    function getStateAt(pos, cm) {

        var token = cm.getTokenAt(pos, true);
        // console.log(pos, token);

        var state = token.state;

        // This is something added by overlay.js
        if (state.overlay) {
            // console.log("Checking base state for overlay state");
            state = state.base;
        }

        return state;

    }


});
