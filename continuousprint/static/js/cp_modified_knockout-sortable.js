/*global ko*/

// WARNING WARNING WARNING
// This has been modified from the source at https://github.com/SortableJS/knockout-sortablejs
// See developer tips section of https://github.com/smartin015/continuousprint/blob/master/README.md

(function (factory) {
	"use strict";
	//get ko ref via global or require
	var koRef;
	if (typeof ko !== 'undefined') {
		//global ref already defined
		koRef = ko;
	}
	else if (typeof require === 'function' && typeof exports === 'object' && typeof module === 'object') {
		//commonjs / node.js
		koRef = require('knockout');
	}
	//get sortable ref via global or require
	var sortableRef;
	if (typeof CPSortable !== 'undefined') {
		//global ref already defined
		sortableRef = CPSortable;
	}
	else if (typeof require === 'function' && typeof exports === 'object' && typeof module === 'object') {
		//commonjs / node.js
		sortableRef = require('sortablejs');
	}
	//use references if we found them
	if (koRef !== undefined && sortableRef !== undefined) {
		factory(koRef, sortableRef);
	}
	//if both references aren't found yet, get via AMD if available
	else if (typeof define === 'function' && define.amd) {
		//we may have a reference to only 1, or none
		if (koRef !== undefined && sortableRef === undefined) {
			define(['./CPSortable'], function (amdCPSortableRef) {
				factory(koRef, amdCPSortableRef);
			});
		}
		else if (koRef === undefined && sortableRef !== undefined) {
			define(['knockout'], function (amdKnockout) {
				factory(amdKnockout, sortableRef);
			});
		}
		else if (koRef === undefined && sortableRef === undefined) {
			define(['knockout', './CPSortable'], factory);
		}
	}
	//no more routes to get references
	else {
		//report specific error
		if (koRef !== undefined && sortableRef === undefined) {
			throw new Error('knockout-sortable could not get reference to CPSortable');
		}
		else if (koRef === undefined && sortableRef !== undefined) {
			throw new Error('knockout-sortable could not get reference to Knockout');
		}
		else if (koRef === undefined && sortableRef === undefined) {
			throw new Error('knockout-sortable could not get reference to Knockout or CPSortable');
		}
	}
})(function (ko, CPSortable) {
    "use strict";

    var init = function (element, valueAccessor, allBindings, viewModel, bindingContext, sortableOptions) {

        var options = buildOptions(valueAccessor, sortableOptions);

        // It's seems that we cannot update the eventhandlers after we've created
        // the sortable, so define them in init instead of update
        ['onStart', 'onEnd', 'onRemove', 'onAdd', 'onUpdate', 'onSort', 'onFilter', 'onMove', 'onClone'].forEach(function (e) {
            if (options[e] || eventHandlers[e])
                options[e] = function (eventType, parentVM, parentBindings, handler, e) {
                    var itemVM = ko.dataFor(e.item),
                        // All of the bindings on the parent element
                        bindings = ko.utils.peekObservable(parentBindings()),
                        // The binding options for the draggable/sortable binding of the parent element
                        bindingHandlerBinding = bindings.cpsortable || bindings.cpdraggable,
                        // The collection that we should modify
                        collection = bindingHandlerBinding.collection || bindingHandlerBinding.foreach;
                    if (handler)
                        return handler(e, itemVM, parentVM, collection, bindings);
                    if (eventHandlers[eventType])
                        return eventHandlers[eventType](e, itemVM, parentVM, collection, bindings);
                }.bind(undefined, e, viewModel, allBindings, options[e]);
        });

        var sortableElement = CPSortable.create(element, options);

        // Destroy the sortable if knockout disposes the element it's connected to
        ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
            sortableElement.destroy();
        });
        return ko.bindingHandlers.template.init(element, valueAccessor);
    },
    update = function (element, valueAccessor, allBindings, viewModel, bindingContext, sortableOptions) {

        // There seems to be some problems with updating the options of a sortable
        // Tested to change eventhandlers and the group options without any luck

        return ko.bindingHandlers.template.update(element, valueAccessor, allBindings, viewModel, bindingContext);
    },
    eventHandlers = (function (handlers) {

        var moveOperations = [],
            tryMoveOperation = function (e, itemVM, parentVM, collection, parentBindings) {
                // A move operation is the combination of a add and remove event,
                // this is to make sure that we have both the target and origin collections
                var currentOperation = { event: e, itemVM: itemVM, parentVM: parentVM, collection: collection, parentBindings: parentBindings },
                    existingOperation = moveOperations.filter(function (op) {
                        return op.itemVM === currentOperation.itemVM;
                    })[0];

                if (!existingOperation) {
                    moveOperations.push(currentOperation);
                }
                else {
                    // We're finishing the operation and already have a handle on
                    // the operation item meaning that it's safe to remove it
                    moveOperations.splice(moveOperations.indexOf(existingOperation), 1);

                    var removeOperation = currentOperation.event.type === 'remove' ? currentOperation : existingOperation,
                        addOperation = currentOperation.event.type === 'add' ? currentOperation : existingOperation;

                    addOperation.event.groupOption = parentBindings.cpsortable.options.group;

                    moveItem(itemVM, removeOperation.collection, addOperation.collection, addOperation.event.clone, addOperation.event);
                }
            },
            // Moves an item from the "from" collection to the "to" collection, these
            // can be references to the same collection which means it's a sort.
            // clone indicates if we should move or copy the item into the new collection
            moveItem = function (itemVM, from, to, clone, e) {
                // Unwrapping this allows us to manipulate the actual array
                var fromArray = from(),
                    // It's not certain that the items actual index is the same
                    // as the index reported by sortable due to filtering etc.
                    originalIndex = fromArray.indexOf(itemVM),
                    newIndex = e.newIndex;

                // We have to find out the actual desired index of the to array,
                // as this might be a computed array. We could otherwise potentially
                // drop an item above the 3rd visible item, but the 2nd visible item
                // has an actual index of 5.
                if (e.item.previousElementSibling) {
                    newIndex = to().indexOf(ko.dataFor(e.item.previousElementSibling)) + 1;
                }

                // Remove sortables "unbound" element
                e.item.parentNode.removeChild(e.item);

                // This splice is necessary for both clone and move/sort
                // In sort/move since it shouldn't be at this index/in this array anymore
                // In clone since we have to work around knockouts valuHasMutated
                // when manipulating arrays and avoid a "unbound" item added by sortable
                fromArray.splice(originalIndex, 1);
                // Update the array, this will also remove sortables "unbound" clone
                from.valueHasMutated();
                var groupOption = e.groupOption;
                // See the option at https://github.com/SortableJS/Sortable#options
                // group: { name: 'shared', pull: 'clone' }
                var cloneable = typeof groupOption === 'object' && groupOption.pull === 'clone';

                if (cloneable && clone && from !== to) {
                    // Read the item
                    fromArray.splice(originalIndex, 0, itemVM);
                    // Force knockout to update
                    from.valueHasMutated();
                }
                // Force deferred tasks to run now, registering the removal
                ko.tasks.runEarly();
                // Insert the item on its new position
                to().splice(newIndex, 0, itemVM);
                // Make sure to tell knockout that we've modified the actual array.
                to.valueHasMutated();
            };

        handlers.onRemove = tryMoveOperation;
        handlers.onAdd = tryMoveOperation;
        handlers.onUpdate = function (e, itemVM, parentVM, collection, parentBindings) {
            // This will be performed as a sort since the to/from collections
            // reference the same collection and clone is set to false
            moveItem(itemVM, collection, collection, false, e);
        };

        return handlers;
    })({}),
    // bindingOptions are the options set in the "data-bind" attribute in the ui.
    // options are custom options, for instance draggable/sortable specific options
    buildOptions = function (bindingOptions, options) {
        // deep clone/copy of properties from the "from" argument onto
        // the "into" argument and returns the modified "into"
        var merge = function (into, from) {
            for (var prop in from) {
                if (Object.prototype.toString.call(from[prop]) === '[object Object]') {
                    if (Object.prototype.toString.call(into[prop]) !== '[object Object]') {
                        into[prop] = {};
                    }
                    into[prop] = merge(into[prop], from[prop]);
                }
                else
                    into[prop] = from[prop];
            }

            return into;
        },
        // unwrap the supplied options
        unwrappedOptions = ko.utils.peekObservable(bindingOptions()).options || {};

        // Make sure that we don't modify the provided settings object
        options = merge({}, options);

        // group is handled differently since we should both allow to change
        // a draggable to a sortable (and vice versa), but still be able to set
        // a name on a draggable without it becoming a drop target.
        if (unwrappedOptions.group && Object.prototype.toString.call(unwrappedOptions.group) !== '[object Object]') {
            // group property is a name string declaration, convert to object.
            unwrappedOptions.group = { name: unwrappedOptions.group };
        }

        return merge(options, unwrappedOptions);
    };

    ko.bindingHandlers.cpdraggable = {
        sortableOptions: {
            group: { pull: 'clone', put: false },
            sort: false
        },
        init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return init(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.cpdraggable.sortableOptions);
        },
        update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return update(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.cpdraggable.sortableOptions);
        }
    };

    ko.bindingHandlers.cpsortable = {
        sortableOptions: {
            group: { pull: true, put: true }
        },
        init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return init(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.cpsortable.sortableOptions);
        },
        update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            return update(element, valueAccessor, allBindings, viewModel, bindingContext, ko.bindingHandlers.cpsortable.sortableOptions);
        }
    };
});
