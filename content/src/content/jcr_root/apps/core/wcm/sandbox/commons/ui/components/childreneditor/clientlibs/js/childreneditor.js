/*******************************************************************************
 * Copyright 2018 Adobe Systems Incorporated
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
/* global CQ */
(function($, ns, channel, window) {
    "use strict";

    var EDITOR_CLASS = "childreneditor";
    var CONFIG_BUTTON_CLASS = "coral-Multifield-config";
    var CONTAINER_PATH_DATA_ATTR = "containerPath";
    var SELECT_LIST_CHANGE_EVENT = "coral-selectlist:change";
    var NN_PREFIX = "item_";
    var PN_TITLE = "jcr:title";
    var PN_RESOURCE_TYPE = "sling:resourceType";

    var defaultInsertFct = ns.editableHelper.actions.INSERT.execute;
    var doNothingFct = function() {}; // "do nothing" function

    var selectors = {
        editor: ".childreneditor",
        child: "coral-multifield-item",
        addButton: ".childreneditor [coral-multifield-add]",
        removeButton: "button[handle='remove']",
        configButton: "button[handle='config']",
        insertComponentDialog: "coral-dialog.InsertComponentDialog",
        allowedComponentsList: "coral-dialog.InsertComponentDialog.childreneditor coral-selectlist"
    };
    var deletedChildren = [];
    var orderedChildren = [];

    // Remove the child item when clicking the remove button
    $(document).on("click", selectors.removeButton, function(event) {
        var $button = $(this);
        var childName = $button.closest(selectors.child).data("name");
        deletedChildren.push(childName);
    });

    // Open the edit dialog of the child item when clicking the config button
    $(document).on("click", selectors.configButton, function(event) {
        var $button = $(this);
        var $editor = $button.closest(selectors.editor);
        if ($editor.length === 1) {
            var childPath = $button.closest(selectors.child).data("childPath");
            var editable = ns.editables.find(childPath)[0];
            var childDialog = new ns.edit.Dialog(editable);
            ns.DialogFrame.isOpened = function() {
                return false;
            };
            ns.DialogFrame.openDialog(childDialog);
        }
    });

    // Display the "Insert New Components" dialog when clicking the add button
    $(document).on("click", selectors.addButton, function(event) {
        var $button = $(this);
        var $editor = $button.closest(selectors.editor);
        if ($editor.length === 1) {
            var containerPath = $editor.data(CONTAINER_PATH_DATA_ATTR);
            var editable = ns.editables.find(containerPath)[0];

            // Display the "Insert New Components" dialog
            ns.edit.ToolbarActions.INSERT.execute(editable);
            var $insertComponentDialog = $(selectors.insertComponentDialog);
            $insertComponentDialog.addClass(EDITOR_CLASS);
        }
    });

    // Set the resource type parameter when selecting a component from the "Insert New Components" dialog
    $(document).off(SELECT_LIST_CHANGE_EVENT, selectors.allowedComponentsList).on(SELECT_LIST_CHANGE_EVENT, selectors.allowedComponentsList, function(event) {

        $(selectors.allowedComponentsList).off(SELECT_LIST_CHANGE_EVENT);

        var resourceType;
        var $insertComponentDialog = $(this).closest(selectors.insertComponentDialog);
        $insertComponentDialog.hide();

        var component = ns.components.find(event.detail.selection.value);
        if (component.length > 0) {
            resourceType = component[0].getResourceType();
        }

        var $editor = $(selectors.editor);
        // We need one more frame to make sure the item renders the template in the DOM
        Coral.commons.nextFrame(function() {

            var $child = $editor.find(selectors.child).last();
            var childName = NN_PREFIX + Date.now();
            var inputName = "./" + childName + "/" + PN_TITLE;
            $child.data("name", childName);
            var $input = $child.find("input");
            $input.attr("name", inputName);

            // append hidden input element for the resource type
            $("<input>").attr({
                type: "hidden",
                name: "./" + childName + "/" + PN_RESOURCE_TYPE,
                value: resourceType
            }).insertAfter($input);

        }.bind(this));

    });

    // Trigger the POST request to add, remove, re-order children nodes
    function processChildren($editor) {

        // Process re-ordered items
        $editor.find(selectors.child).each(function() {
            var $child = $(this);
            var childName = $child.data("name");
            orderedChildren.push(childName);
        });

        var path = $editor.data(CONTAINER_PATH_DATA_ATTR);
        var panelContainer = new CQ.CoreComponents.PanelContainer({
            path: path
        });

        panelContainer.update(orderedChildren, deletedChildren);

        deletedChildren = [];
        orderedChildren = [];
    }

    // Submit hook to process the children
    $(window).adaptTo("foundation-registry").register("foundation.form.submit", {
        selector: "*",
        handler: function(formEl) {
            var $editor = $(formEl).find(selectors.editor);
            return {
                post: function() {
                    processChildren($editor);
                }
            };
        }
    });

    // Modify the behavior of the default INSERT action (ns.editableHelper.actions.INSERT.execute):
    // - disable it when the children editor is opened (as we don't want to insert a component on the page)
    // - re-enable it when the children editor is closed
    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    var body             = document.querySelector("body");
    var observer         = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {

            // Disable the default INSERT action when the children editor is opened
            var addedNodesArray = [].slice.call(mutation.addedNodes);
            if (addedNodesArray.length > 0) {
                addedNodesArray.forEach(function(addedNode) {
                    if (addedNode.querySelectorAll) {
                        var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.editor));
                        if (elementsArray.length === 1) {
                            ns.editableHelper.actions.INSERT.execute = doNothingFct;
                            var $editor = $(elementsArray[0]);
                            addConfigButtons($editor);
                        }
                    }
                });
            }

            // Re-enable the default INSERT action when the children editor is closed
            var removedNodesArray = [].slice.call(mutation.removedNodes);
            if (removedNodesArray.length > 0) {
                removedNodesArray.forEach(function(removedNode) {
                    if (removedNode.querySelectorAll) {
                        var elementsArray = [].slice.call(removedNode.querySelectorAll(selectors.editor));
                        if (elementsArray.length === 1) {
                            ns.editableHelper.actions.INSERT.execute = defaultInsertFct;
                        }
                    }
                });
            }
        });
    });

    observer.observe(body, {
        subtree: true,
        childList: true,
        characterData: true
    });

    // Add a config button to each child item
    function addConfigButtons($editor) {
        $editor.find(selectors.child).each(function() {
            var $child = $(this);
            var $configButton = $child.find(selectors.configButton);
            // Don't add a button if there is already one
            if ($configButton.length === 0) {
                var $removeButton = $child.find(selectors.removeButton);
                var el = document.createElement("button", "coral-button");
                el.setAttribute("type", "button");
                el.setAttribute("is", "coral-button");
                el.setAttribute("handle", "config");
                el.setAttribute("variant", "quiet");
                el.setAttribute("icon", "wrench");
                el.setAttribute("iconsize", "S");
                el.className += " ";
                el.className += CONFIG_BUTTON_CLASS;
                $(el).insertBefore($removeButton);
            }
        });
    }

}(jQuery, Granite.author, jQuery(document), this));
