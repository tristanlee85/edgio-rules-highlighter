// ==UserScript==
// @name         Edgio Rules Highlighter
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Highlights matches rules in both the Rules Editor and JSON Editor views.
// @author       Tristan Lee
// @match        *://*.edgio.app/*
// ==/UserScript==

(function () {
  'use strict';

  // Monitor changes in the URL and check if we're on the rules page
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      checkAndRun(); // Check the new URL and run the script if necessary
    }
  }).observe(document, { subtree: true, childList: true });

  // Initial check when the script runs
  checkAndRun();

  // Main function to check the URL and run the appropriate actions
  function checkAndRun() {
    if (window.location.pathname.endsWith('/rules')) {
      observeMutations();
    }
  }

  // Function to observe DOM mutations and call insertTextField when the target element is available
  function observeMutations() {
    let textFieldInserted = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('.MuiGrid-root.MuiGrid-container')) {
        if (!textFieldInserted) {
          insertTextField();
          textFieldInserted = true;
          observer.disconnect();
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Function to insert the text field and handle input
  function insertTextField() {
    const targetContainer = document.querySelector(
      '.MuiGrid-root.MuiGrid-container'
    );
    if (targetContainer) {
      const targetDiv = targetContainer.nextElementSibling;
      if (targetDiv) {
        const containerDiv = createInputContainer();
        targetDiv.parentNode.insertBefore(containerDiv, targetDiv);
        addInputFieldEventListeners(containerDiv, targetDiv);
      }
    }
  }

  // Function to create the input container with label and input field
  function createInputContainer() {
    const containerDiv = document.createElement('div');
    containerDiv.style.width = '100%';
    containerDiv.style.marginBottom = '10px';

    const label = document.createElement('label');
    label.textContent = 'Highlight Rules';
    label.style.display = 'block';
    label.style.marginBottom = '5px';
    label.style.fontSize = '14px';
    label.style.color = 'rgba(0, 0, 0, 0.87)';
    label.style.fontFamily = '"Roboto", "Helvetica", "Arial", sans-serif';
    label.style.lineHeight = '1.5';
    label.style.letterSpacing = '0.00938em';

    const inputWrapper = document.createElement('div');
    inputWrapper.style.position = 'relative';
    inputWrapper.style.width = '100%';

    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder =
      '(e.g., x-edg-mr: 591:0;591:3;591:8;591:12;591:13;591:29;591:33;)';
    inputField.style.width = '100%';
    inputField.style.padding = '10px 30px 10px 10px';
    inputField.style.border = '1px solid rgba(0, 0, 0, 0.23)';
    inputField.style.borderRadius = '4px';
    inputField.style.fontSize = '16px';
    inputField.style.boxSizing = 'border-box';

    const clearIcon = createClearIcon(inputField);

    inputWrapper.appendChild(inputField);
    inputWrapper.appendChild(clearIcon);
    containerDiv.appendChild(label);
    containerDiv.appendChild(inputWrapper);

    return containerDiv;
  }

  // Function to create the clear icon
  function createClearIcon(inputField) {
    const clearIcon = document.createElement('span');
    clearIcon.textContent = '✕';
    clearIcon.style.cursor = 'pointer';
    clearIcon.style.position = 'absolute';
    clearIcon.style.right = '10px';
    clearIcon.style.top = '50%';
    clearIcon.style.transform = 'translateY(-50%)';
    clearIcon.style.fontSize = '16px';
    clearIcon.style.color = 'rgba(0, 0, 0, 0.54)';

    clearIcon.addEventListener('click', function () {
      const jsonEditor =
        typeof monaco !== 'undefined' && monaco.editor.getEditors()[0];
      if (jsonEditor) {
        restoreJsonEditor(jsonEditor);
      } else {
        handleFiltering('', targetDiv); // Clear the filtering
      }
      inputField.value = '';
    });

    return clearIcon;
  }

  // Function to add event listeners for the input field
  function addInputFieldEventListeners(containerDiv, targetDiv) {
    const inputField = containerDiv.querySelector('input');
    inputField.addEventListener('input', function () {
      const jsonEditor =
        typeof monaco !== 'undefined' && monaco.editor.getEditors()[0];
      const pattern = inputField.value.trim();
      if (pattern) {
        if (jsonEditor) {
          highlightJsonRules(
            jsonEditor,
            getIndiciesOfRulesToHighlight(pattern)
          );
        } else {
          scrollToBottomAndHighlight(pattern, targetDiv);
        }
      } else {
        if (jsonEditor) {
          restoreJsonEditor(jsonEditor);
        } else {
          handleFiltering(pattern, targetDiv); // Clear the filtering if input is empty
        }
      }
    });
  }

  // Function to highlight JSON rules
  function highlightJsonRules(editor, ruleIndicies) {
    let jsonValue;
    try {
      jsonValue = JSON.parse(editor.getModel().getValue());
    } catch (error) {
      console.error('Invalid JSON in editor:', error);
      return;
    }

    const startLines = getStartLinesForRules(jsonValue);
    ruleIndicies.forEach((index) => {
      if (startLines[index]) {
        startLines[index] = null;
      }
    });

    const actions = editor.getSupportedActions();
    const foldAction = actions.find((a) => a.id === 'editor.fold');
    const unFoldAction = actions.find((a) => a.id === 'editor.unfoldAll');

    unFoldAction.run();
    editor.setSelection(new monaco.Selection(0, 0, 0, 0));

    editor.setSelections(
      startLines.filter(Boolean).map((line) => ({
        positionColumn: 1,
        positionLineNumber: line,
        selectionStartColumn: 1,
        selectionStartLineNumber: line,
      }))
    );
    foldAction.run();
  }

  // Function to restore the JSON editor
  function restoreJsonEditor(editor) {
    const actions = editor.getSupportedActions();
    const unFoldAction = actions.find((a) => a.id === 'editor.unfoldAll');
    editor.setSelection(new monaco.Selection(0, 0, 0, 0));
    unFoldAction.run();
  }

  // Function to scroll to the bottom and then back to the original position before highlighting
  function scrollToBottomAndHighlight(pattern, targetDiv) {
    const container = document.querySelector('main');
    const originalScrollPosition = container.scrollY;
    container.scrollTo({
      top: container.scrollHeight + 1000,
      behavior: 'smooth',
    });

    setTimeout(() => {
      container.scrollTo(0, originalScrollPosition);
      handleFiltering(pattern, targetDiv);
    }, 1000); // Adjust the timeout as necessary to ensure elements are rendered
  }

  // Function to handle filtering and collapse rows
  function handleFiltering(pattern, targetDiv) {
    const buttonElements = targetDiv.querySelectorAll('button');
    if (buttonElements.length >= 2) {
      buttonElements[1].click();
    }

    highlightElements(pattern);
  }

  // Function to highlight elements based on the input pattern
  function highlightElements(pattern) {
    const container = document.querySelector(
      '.MuiBox-root form div[data-rbd-droppable-id="droppable-rules"]'
    );
    if (container) {
      if (pattern) {
        const indexMatches = getIndiciesOfRulesToHighlight(pattern);
        Array.from(container.children).forEach((child, index) => {
          const ruleRow = child.firstChild;
          if (indexMatches.includes(String(index))) {
            ruleRow.style.opacity = '1';
            ruleRow.style.backgroundColor = 'rgba(255, 165, 0, 0.1)'; // Soft orange highlight
          } else {
            ruleRow.style.opacity = '0.25'; // Filtered out style
            ruleRow.style.backgroundColor = ''; // Remove background color
          }
        });
      } else {
        Array.from(container.children).forEach((child) => {
          const ruleRow = child.firstChild;
          ruleRow.style.opacity = '1'; // Restore original opacity
          ruleRow.style.backgroundColor = ''; // Remove any background color
        });
      }
    }
  }

  // Function to get starting line numbers for rules
  function getStartLinesForRules(rules) {
    const lines = JSON.stringify(rules, null, 2).split('\n');
    const startingLineNumbers = [];

    lines.forEach((line, index) => {
      if (line.startsWith('  {')) {
        startingLineNumbers.push(index + 1);
      }
    });

    return startingLineNumbers;
  }

  // Function to get indices of rules to highlight based on the input pattern
  function getIndiciesOfRulesToHighlight(pattern) {
    return [...pattern.matchAll(/\d+:(\d+)/g)].map((match) => match[1]);
  }
})();
