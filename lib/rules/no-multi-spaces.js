/**
 * @fileoverview Disallow use of multiple spaces.
 * @author Nicholas C. Zakas
 */

"use strict";

const astUtils = require("../ast-utils");

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "disallow multiple spaces",
            category: "Best Practices",
            recommended: false
        },

        fixable: "whitespace",

        schema: [
            {
                type: "object",
                properties: {
                    exceptions: {
                        type: "object",
                        patternProperties: {
                            "^([A-Z][a-z]*)+$": {
                                type: "boolean"
                            }
                        },
                        additionalProperties: false
                    },
                    ignoreEOLComments: {
                        type: "boolean"
                    }
                },
                additionalProperties: false
            }
        ]
    },

    create(context) {

        // the index of the last comment that was checked
        const sourceCode = context.getSourceCode(),
            exceptions = { Property: true },
            options = context.options[0] || {},
            ignoreEOLComments = options.ignoreEOLComments !== false;
        let hasExceptions = true,
            lastCommentIndex = 0;

        if (options && options.exceptions) {
            Object.keys(options.exceptions).forEach(key => {
                if (options.exceptions[key]) {
                    exceptions[key] = true;
                } else {
                    delete exceptions[key];
                }
            });
            hasExceptions = Object.keys(exceptions).length > 0;
        }


        /**
         * Checks if a given token is a comment token.
         * TODO: Use ast-utils version when https://github.com/eslint/eslint/pull/7516 lands.
         *
         * @param {Token} token The token to check.
         * @returns {boolean} Whether or not a token is a comment token.
         * @private
         */
        function isComment(token) {
            return token.type === "Block" || token.type === "Line";
        }

        /**
         * Checks if a given token is the last token of the line or not.
         * @param {Token} token The token to check.
         * @returns {boolean} Whether or not a token is at the end of the line it occurs in or not.
         * @private
         */
        function isLastTokenOfLine(token) {
            const nextToken = sourceCode.getTokenOrCommentAfter(token);

            // nextToken is undefined if the comment is the last token in the program.
            if (!nextToken) {
                return true;
            }

            return !astUtils.isTokenOnSameLine(token, nextToken);
        }

        /**
         * Determines if a given source index is in a comment or not by checking
         * the index against the comment range. Since the check goes straight
         * through the file, once an index is passed a certain comment, we can
         * go to the next comment to check that.
         * @param {int} index The source index to check.
         * @param {ASTNode[]} comments An array of comment nodes.
         * @returns {boolean} True if the index is within a comment, false if not.
         * @private
         */
        function isIndexInComment(index, comments) {
            while (lastCommentIndex < comments.length) {
                const comment = comments[lastCommentIndex];

                if (comment.range[0] < index && index < comment.range[1]) {
                    return true;
                } else if (index > comment.range[1]) {
                    lastCommentIndex++;
                } else {
                    break;
                }
            }

            return false;
        }

        /**
         * Formats value of given comment token for error message by truncating its length.
         * @param {Token} token comment token
         * @returns {string} formatted value
         * @private
         */
        function formatReportedCommentValue(token) {
            const isBlockComment = token.type === "Block";
            const valueLines = token.value.split("\n");
            const value = valueLines[0];
            const formattedValue = `${value.substring(0, 12)} ...${isBlockComment ? " " : ""}`;

            return valueLines.length === 1 && value.length <= 12 ? value : formattedValue;
        }

        /**
         * Creates a fix function that removes the multiple spaces between the two tokens
         * @param {Token} leftToken left token
         * @param {Token} rightToken right token
         * @returns {Function} fix function
         * @private
         */
        function createFix(leftToken, rightToken) {
            return function(fixer) {
                return fixer.replaceTextRange([leftToken.range[1], rightToken.range[0]], " ");
            };
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            Program() {

                const source = sourceCode.getText(),
                    allComments = sourceCode.getAllComments(),
                    JOINED_LINEBEAKS = Array.from(astUtils.LINEBREAKS).join(""),
                    pattern = new RegExp(String.raw`[^ \t${JOINED_LINEBEAKS}].? {2,}`, "g");  // note: repeating space
                let parent;

                while (pattern.test(source)) {

                    // do not flag anything inside of comments
                    if (!isIndexInComment(pattern.lastIndex, allComments)) {

                        const token = sourceCode.getTokenOrCommentByRangeStart(pattern.lastIndex);

                        if (token) {
                            if (ignoreEOLComments && isComment(token) && isLastTokenOfLine(token)) {
                                return;
                            }

                            const previousToken = sourceCode.getTokenOrCommentBefore(token);

                            if (hasExceptions) {
                                parent = sourceCode.getNodeByRangeIndex(pattern.lastIndex - 1);
                            }

                            if (!parent || !exceptions[parent.type]) {
                                let value = token.value;

                                if (token.type === "Block") {
                                    value = `/*${formatReportedCommentValue(token)}*/`;
                                } else if (token.type === "Line") {
                                    value = `//${formatReportedCommentValue(token)}`;
                                }

                                context.report({
                                    node: token,
                                    loc: token.loc.start,
                                    message: "Multiple spaces found before '{{value}}'.",
                                    data: { value },
                                    fix: createFix(previousToken, token)
                                });
                            }
                        }

                    }
                }
            }
        };

    }
};
