"use strict";
angular.module('control')
// x-reorder-collection-modal attribute of a button
.directive("reorderCollectionModal",['$modal', '_', 'CollectionModel', 'AlertService', 'moment', reorderCollectionModal])
// x-reorder-collection-content element in the modal
.directive('reorderCollectionContent', [reorderCollectionContent ])
// dnd-scroll-area a region above and below the reordering list that helps scrolling the list
.directive("dndScrollArea", dndScrollArea)
.controller("collectionsSortingController", collectionsSortingController)
;

function reorderCollectionModal($modal, _, CollectionModel, AlertService, moment) {
	return {
		restrict: 'A',
		scope: {
			collection: '=',
			project: '=',
			currentPath: '=',
			onSave: '='
		},
		link: function (scope, element, attributes) {
			element.on('click', function () {
				$modal.open({
					animation: true,
					templateUrl: 'modules/collections/client/views/modal-collections-reorder.html',
					controllerAs: 'vmm',
					size: 'lg',
					windowClass: 'fs-modal',
					controller: function ($modalInstance) {
						var self = this;
						self.busy = false;
						self.ok = submit;
						self.cancel = cancel;
						self.currentPath = scope.currentPath;
						self.collection = scope.collection;
						self.defaultSortField = 'custom';
						self.sorting={};
						self.protoSide = 'sideB';

						self.setDefaultSortOrder = function(value) {
							console.log('sort order', value);
							self.defaultSortField = value ? value : '';
							switch(self.defaultSortField) {
								case 'date-asc':
									self.sorting.column = 'date';
									self.sorting.ascending = true;
									break;
								case 'date-desc':
									self.sorting.column = 'date';
									self.sorting.ascending = false;
									break;
								case 'name-asc':
									self.sorting.column = 'name';
									self.sorting.ascending = true;
									break;
								case 'name-desc':
									self.sorting.column = 'name';
									self.sorting.ascending = false;
									break;
								case 'custom':
									self.sorting.column = 'custom';
									break;
							}
							self.applySort();
						};
						//deep'ish copy of original list of documents. We can sort this without affecting the original
						self.documents = [];
						self.folders = [];
						_.forEach(self.collection.documents, function(doc) {
							var elem = {
								document: {}
							};
							var d = elem.document;
							d.displayName = doc.displayName;
							d.documentDate = doc.documentDate;
							d.isPublished = doc.isPublished;
							self.documents.push(elem);
						});
						_.forEach(self.collection.folders, function(doc) {
							var elem = {
								document: {}
							};
							var d = elem.document;
							d.displayName = doc.model.name;
							d.sortOrder = doc.model.order;
							d.isPublished = doc.model.published;
							self.folders.push(elem);
						});

						self.applySort = function() {
							var direction = self.sorting.ascending ? 1 : -1;
							var collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
							if (self.sorting.column === 'name') {
								self.documents.sort(function (d1, d2) {
									var v = collator.compare(d1.document.displayName, d2.document.displayName);
									return v * direction;
								});
								self.folders.sort(function (d1, d2) {
									var v = collator.compare(d1.document.displayName, d2.document.displayName);
									return v * direction;
								});
							} else if (self.sorting.column === 'date') {
								self.documents.sort(function(a, b){
									var doc1 = a.document;
									var doc2 = b.document;
									/*
									 Sort by date but account for the case the display value is like June 2017.  We want to group all
									 June 2017 docs before any like 2017-01-01.
									 */
									var d1 = doc1.documentDate ? {d: moment(doc1.documentDate), my: doc1.documentDateDisplayMnYr} : undefined;
									var d2 = doc2.documentDate ? {d: moment(doc2.documentDate), my: doc2.documentDateDisplayMnYr} : undefined;
									if (d1 && d2 && d1.d.isSame(d2.d,'month')) {
										if (d1.my && d2.my) {
											return (d1.d.valueOf() - d2.d.valueOf()) * direction;
										} else if (d1.my) {
											return -1 * direction;
										}  else if (d2.my) {
											return 1 * direction;
										}
									}
									d1 = d1 ? d1.d.valueOf() : 0;
									d2 = d2 ? d2.d.valueOf() : 0;
									return (d1 - d2) * direction;
								});
							}

							//scope.$apply();
						};

						function cancel () {
							$modalInstance.dismiss('cancel');
						}
						function submit () {
							self.busy = true;
							var list = self.list;
							var ids = [];
							list.forEach(function(item) {
								ids.push(item._id);
							});
							CollectionModel.sortOtherDocuments(self.collection._id, ids)
							.then(function(sortedDocs) {
								AlertService.success('"'+ self.collection.displayName +'"' + ' was reordered successfully.');
								if (sortedDocs) {
									self.collection.otherDocuments = sortedDocs;
								}
								$modalInstance.close(sortedDocs);
							})
							.catch(function(res) {
								console.log("Error:", res);
								var failure = _.has(res, 'message') ? res.message : undefined;
								AlertService.error('"'+ self.collection.displayName +'"' + ' was not reordered');
								$modalInstance.close();
							});
						}
					}
				}).result
				.then (function() {
					if (scope.onSave) {
						scope.onSave();
					}
				})
				.catch(function (err) {
					if ('cancel' !== err && 'backdrop click' !== err) {
						console.log("Error in reorderCollectionModal", err);
					}
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
			list: '=',
			disableDragging: '='
		}
	};
	return directive;
}


collectionsSortingController.$inject = ['$scope', '$document', '$timeout'];
/* @ngInject */
function collectionsSortingController($scope, $document, $timeout) {
	var self = this;
	self.dragging = false;
	self.list = $scope.list;
	self.getSelectedItemsIncluding = getSelectedItemsIncluding;
	self.onDragstart = onDragstart;
	self.onDragend = onDragend;
	self.onDrop = onDrop;
	self.onMoved = onMoved;
	self.disableDragging = $scope.disableDragging;
	self.sorting = {ascending: true, column: ''};

	self.list.forEach(function(item) {
		item.selected = false;
	});

	function getSelectedItemsIncluding(item) {
		item.selected = true;
		return self.list.filter(function(item) {
			return item.selected;
		});
	}

	function onDragstart(event, idPrefix) {
		self.dragging = true;
		console.log("dstart")
		return false;
	}

	function onDragend() {
		self.dragging = false;
	}

	function onDrop(items, index) {
		angular.forEach(items, function(item) {
			item.selected = false;
		});
		self.list = self.list.slice(0, index)
		.concat(items)
		.concat(self.list.slice(index));
		self.list.forEach(function(item,index) {
			item.sortOrder = index;
		});
		return true;
	}

	function onMoved() {
		// remove the items that were just dragged (they are still selected)
		self.list = self.list.filter(function(item) {
			return !item.selected;
		});
		$scope.list = self.list;
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
