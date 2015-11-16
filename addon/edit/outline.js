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

  var listRE = /^(\s*)(>[> ]*|[*+-]|(\d+)([.)]))(\s+)/,
      emptyIndentedListRE = /^(\s+)(>[> ]*|[*+-]|(\d+)[.)])(\s*)$/,
      emptyListRE = /^(>[> ]*|[*+-]|(\d+)[.)])(\s*)$/,
      unorderedListRE = /[*+-]\s/,
      emptyLineRE = /^(\s*)$/;

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

                // Readjust numbered prefixes
                var anchorLine = findListAnchor(cm, fromPos.line);
                console.log("Adjusting prefixes from " + anchorLine);
                adjustNumberedPrefixes(cm, anchorLine, false);

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
            var bullet = isNaN(match[3]) ? match[2] : (parseInt(match[3], 10) + 1) + match[4];
            
            return "\n" + indent + bullet + after;
        }
        
    };
    
    CodeMirror.commands.indentMarkdownListTab = function(cm) {

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

            if (match) {
                console.log("Increasing list indent");
                cm.execCommand("indentMore");
                
                // Readjust numbered prefixes
                var anchorLine = findListAnchor(cm, pos.line);
                console.log("Adjusting prefixes from " + anchorLine);
                adjustNumberedPrefixes(cm, anchorLine, false);
                
                return;
            }
            else return CodeMirror.Pass;
        }

        cm.replaceSelections(replacements);
        
    };


    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Supporting functions

    function getStateAt(pos, cm) {

        var state = cm.getTokenAt(pos, true).state;
        return state.overlay ? state.base : state;

    }

    function getStateAtLine(line, cm) {
        
        var state = cm.getStateAfter(line, true);
        return state.overlay ? state.base : state;

    }
    
    /**
     * @param cm CodeMirror instance
     * @param lineStart Line number of the first line to adjust
     */
    function adjustNumberedPrefixes(cm, lineStart, resetNumbering) {
        
        var state = getStateAtLine(lineStart, cm);
        var currentDepth = state.listDepth;
        var currentOrder = (state.listOrder !== null && resetNumbering) ? 1 : state.listOrder;
        
        // Init cycle variables
        var nextLine = lineStart;
        var nextOrder = currentOrder;
        
        // Go through all the lines until indent is lower or end of file
        while (nextLine < cm.lineCount()) {
            // console.log("Checking line " + nextLine);
            // console.log("Comparing depth", state.listDepth, currentDepth);
            if (state.listDepth === currentDepth) {
                // If listOrder is filled (i.e. numbered list), make sure it has the right ordinal
                if (/*state.listOrder != null &&*/ state.listOrder !== nextOrder) {
                    // console.log("Should adjust numbered prefix at line " + nextLine + " from " + state.listOrder + " to " + nextOrder);
                    resetNumberedPrefix(cm, nextLine, nextOrder);
                }
                nextLine++;
                if (nextOrder !== null) nextOrder++;
            }
            else if (state.listDepth > currentDepth) {
                // console.log(">>>");
                nextLine = adjustNumberedPrefixes(cm, nextLine, true);
                // No change to order - still expecting the same number
            }
            else {
                // console.log("<<<");
                return nextLine;
            }
            state = getStateAtLine(nextLine, cm);
        }
        
    }
    
    function resetNumberedPrefix(cm, lineNumber, newPrefix) {

        // Get the line's text and parse the prefix
        // TODO: Maybe do some checks to make sure we matched a proper number prefix
        var lineText = cm.getLine(lineNumber), match = listRE.exec(lineText);
        
        // Find the range of the number in prefix and replace it
        var prefixPos = match[1].length, after = match[5];
        var prefixLen = match[2].length;
        var bullet = null;
        if (newPrefix) {
            bullet = newPrefix + (match[4] == ")" ? ")" : ".");
        }
        else {
            bullet = "-";
        }
        
        cm.replaceRange(bullet, 
                        { line: lineNumber, ch: prefixPos }, 
                        { line: lineNumber, ch: prefixPos + prefixLen });
        
    }
    
    function findListAnchor(cm, lineNumber) {
        
        var state = getStateAtLine(lineNumber, cm);
        var currentDepth = state.listDepth;

        // Init cycle variables
        var nextLine = lineNumber - 1;

        // Go through all the lines until indent is lower or end of file
        while (nextLine > 0) {
            state = getStateAtLine(nextLine, cm);
            // console.log("Checking line " + nextLine);
            // console.log("Comparing depth", state.listDepth, currentDepth);
            if (state.listDepth < currentDepth) break;
            nextLine--;
        }
        
        return nextLine;

    }

});
