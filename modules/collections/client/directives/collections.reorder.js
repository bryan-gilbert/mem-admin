"use strict";
angular.module('control')
// x-reorder-collection-modal attribute of a button
.directive("reorderCollectionModal",['$modal',  reorderCollectionModal])
// x-reorder-collection-content element in the modal
.directive('reorderCollectionContent', [reorderCollectionContent ])
// dnd-scroll-area a region above and below the reordering list that helps scrolling the list
.directive("dndScrollArea", dndScrollArea)
.controller("collectionsSortingController", collectionsSortingController)
;

function reorderCollectionModal($modal, _) {
	return {
		restrict: 'A',
		scope: {
			collection: '='
		},
		link: function (scope, element, attributes) {
			element.on('click', function () {
				$modal.open({
					animation: true,
					templateUrl: 'modules/collections/client/views/modal-collections-reorder.html',
					controllerAs: 'vmm',
					size: 'lg',
					controller: function ($modalInstance) {
						var vmm = this;
						vmm.items = scope.collection.otherDocuments;
						vmm.ok = submit;
						vmm.cancel = cancel;

						function cancel () {
							$modalInstance.dismiss('cancel');
						}
						function submit () {
							$modalInstance.close();
						}
					}
				}).result.then(function () {
					console.log("this is where we set the new order");
				})
				.catch(function (err) {
					console.log("Error in reorderCollectionModal", err);
				});
			});
		}
	};
}

function reorderCollectionContent() {
	var directive = {
		restrict: 'E',
		templateUrl: 'modules/collections/client/views/collections-reorder-content.html',
		controller: 'collectionsSortingController',
		controllerAs: 'vm',
		scope: {
			items: '='
		}
	};
	return directive;
}


collectionsSortingController.$inject = ['$scope', '$document', '$timeout'];
/* @ngInject */
function collectionsSortingController($scope, $document, $timeout) {
	var vm = this;
	vm.items = $scope.items;
	vm.collection = {
		items: vm.items,
		dragging: false
	};
	vm.getSelectedItemsIncluding = getSelectedItemsIncluding;
	vm.onDragstart = onDragstart;
	vm.onDragend = onDragend;
	vm.onDrop = onDrop;
	vm.onMoved = onMoved;
	vm.sortBy = sortBy;
	vm.sorting = {ascending: true, column: ''};

	// vm.sortBy('name');

	vm.items.forEach(function(item) {
		console.log("item ", item._id, item.document.displayName, item.sortOrder);
	});

	function sortBy(column) {
		if (vm.sorting.column === column.toLowerCase()) {
			//so we reverse the order...
			vm.sorting.ascending = !vm.sorting.ascending;
		} else {
			// changing column, set to ascending...
			vm.sorting.column = column.toLowerCase();
			vm.sorting.ascending = true;
		}
		var direction = vm.sorting.ascending ? 1 : -1;
		var collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
		var list = vm.collection.items;

		if (vm.sorting.column === 'name') {
			vm.collection.items.sort(function (d1, d2) {
				var v = collator.compare(d1.document.displayName, d2.document.displayName);
				return v * direction;
			});
		} else if (vm.sorting.column === 'date') {
			list.sort(function (doc1, doc2) {
				var d1 = doc1.document.documentDate || 0;
				var d2 = doc2.document.documentDate || 0;
				return (new Date(d1) - new Date(d2)) * direction;
			});
		} else if (vm.sorting.column === 'status') {
			list.sort(function (doc1, doc2) {
				var d1 = doc1.document.isPublished ? 1 : 0;
				var d2 = doc2.document.isPublished ? 1 : 0;
				return (d1 - d2) * direction;
			});
		}
		else if (vm.sorting.column === 'random') {
			list.sort(function (doc1, doc2) {
				var d1 = Math.random();
				var d2 = Math.random();
				return (d1 - d2) * direction;
			});
		}
	}

	function getSelectedItemsIncluding(list, item) {
		item.selected = true;
		return list.items.filter(function(item) {
			return item.selected;
		});
	}

	function onDragstart(list, event, idPrefix) {
		list.dragging = true;
		var selected = list.items.filter(function(item) {
			return item.selected;
		});
		$timeout(function() {
			selected.forEach(function (item) {
				var dom = $document[0].getElementById(idPrefix+item.document._id);
				var element = angular.element(dom);
				element.addClass("dndDraggingSource");
			});
		}, 0);
	}

	function onDragend(list, event) {
		list.dragging = false;
	}

	function onDrop(list, items, index) {
		angular.forEach(items, function(item) {
			item.selected = false;
		});
		list.items = list.items.slice(0, index)
		.concat(items)
		.concat(list.items.slice(index));
		list.items.forEach(function(item,index) {
			item.sortOrder = index;
		});
		return true;
	}

	function onMoved(list) {
		list.items = list.items.filter(function(item) {
			return !item.selected;
		});
	}
}

dndScrollArea.$inject = ['$document', '$interval'];
/* @ngInject */
function dndScrollArea($document, $interval) {
	//  <div class="dnd-scroll-area" dnd-scroll-area dnd-region="top" dnd-scroll-container="collectionList"></div>
	return {
		link: link
	};

	function link(scope, element, attributes) {
		var inc = 5 * (attributes.dndRegion === 'top' ? -1: ( attributes.dndRegion === 'bottom' ? 1 : 0));
		var container = $document[0].getElementById(attributes.dndScrollContainer);
		var speed = 10;
		if(container) {
			var timer;
			element.on('dragenter', function() {
				container.scrollTop += inc;
				timer = $interval(function moveScroll() {
					container.scrollTop += inc;
				}, speed);
			});
			element.on('dragleave', function() {
				$interval.cancel(timer);
			});
		}
	}
}
