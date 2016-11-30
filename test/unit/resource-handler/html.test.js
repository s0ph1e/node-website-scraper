require('should');
var _ = require('lodash');
var Promise = require('bluebird');
var sinon = require('sinon');
require('sinon-as-promised')(Promise);
var Scraper = require('../../../lib/scraper');
var Resource = require('../../../lib/resource');
var loadHtml = require('../../../lib/resource-handler/html');

var defaultScraperOpts = {
	urls: [ 'http://example.com' ],
	directory: __dirname + '/.html-test',
	sources: [
		{ selector: 'img', attr: 'src' },
		{ selector: 'img', attr: 'srcset' },
		{ selector: 'link[rel="stylesheet"]', attr: 'href' },
		{ selector: 'script', attr: 'src'},
		{ selector: 'a', attr: 'href' }
	]
};
var scraper;

describe('ResourceHandler: Html', function () {

	beforeEach(function() {
		scraper = new Scraper(defaultScraperOpts);
		sinon.stub(scraper, 'loadResource').resolves();
	});

	describe('#loadHtml', function() {

		describe('<base> tag', function () {
			it('should remove base tag from text and update url for absolute href', function() {
				var html = ' \
				<html lang="en"> \
				<head> \
				<base href="http://some-other-domain.com/src">\
				</head> \
				<body></body> \
				</html>\
			';
				var po = new Resource('http://example.com', 'index.html');
				po.setText(html);

				return loadHtml(scraper, po).then(function() {
					po.getUrl().should.be.eql('http://some-other-domain.com/src');
				});
			});

			it('should remove base tag from text and update url for relative href', function() {
				var html = ' \
				<html lang="en"> \
				<head> \
				<base href="/src">\
				</head> \
				<body></body> \
				</html>\
			';
				var po = new Resource('http://example.com', 'index.html');
				po.setText(html);

				return loadHtml(scraper, po).then(function() {
					po.getUrl().should.be.eql('http://example.com/src');
				});
			});

			it('should not remove base tag if it doesn\'t have href attribute', function() {
				var html = ' \
				<html lang="en"> \
				<head> \
				<base target="_blank">\
				</head> \
				<body></body> \
				</html>\
			';
				var po = new Resource('http://example.com', 'index.html');
				po.setText(html);

				return loadHtml(scraper, po).then(function() {
					po.getUrl().should.be.eql('http://example.com');
					po.getText().should.containEql('<base target="_blank">');
				});
			});

		});

		it('should not call requestResource if source attr is empty', function() {
			var requestResourceStub = sinon.stub(scraper, 'requestResource').resolves();

			var html = ' \
				<html lang="en"> \
				<head></head> \
				<body><img src=""></body> \
				</html>\
			';

			var po = new Resource('http://example.com', 'index.html');
			po.setText(html);

			return loadHtml(scraper, po).then(function() {
				requestResourceStub.called.should.be.eql(false);
			});
		});

		it('should not encode text to html entities', function () {
			var html = '\
				<html> \
				<body> \
					<p>Этот текст не должен быть преобразован в html entities</p>\
				</body> \
				</html>\
			';

			var po = new Resource('http://example.com', 'index.html');
			po.setText(html);

			return loadHtml(scraper, po).then(function () {
				var text = po.getText();
				text.should.containEql('Этот текст не должен быть преобразован в html entities');
			});
		});

		// TODO: migrate to html-img-srcset-tag path-container
		it('should handle img tag with srcset attribute correctly', function () {

			var image45Stub = new Resource('http://example.com/image45.jpg', 'local/image45.jpg');
			var image150Stub = new Resource('http://example.com/image150.jpg', 'local/image150.jpg');

			sinon.stub(scraper, 'requestResource')
				.onFirstCall().resolves(image45Stub)
				.onSecondCall().resolves(image150Stub)
				.onThirdCall().resolves(image45Stub);


			var html = '\
				<html> \
				<body> \
					<img src="http://example.com/image45.jpg" \
					srcset="http://example.com/image150.jpg 150w, http://example.com/image45.jpg 45w" \
					sizes="(max-width: 45px) 100vw, 45px" width="45" height="45"> \
				</body> \
				</html>\
			';

			var parentResource = new Resource('http://example.com', 'index.html');
			parentResource.setText(html);
			var updateChildSpy = sinon.spy(parentResource, 'updateChild');

			return loadHtml(scraper, parentResource).then(function () {
				var text = parentResource.getText();

				updateChildSpy.calledThrice.should.be.eql(true);

				text.should.not.containEql('http://example.com/image45.jpg');
				text.should.not.containEql('http://example.com/image150.jpg');
				text.should.containEql('src="local/image45.jpg"');
				text.should.containEql('srcset="local/image150.jpg 150w, local/image45.jpg 45w"');
			});
		});
	});
});