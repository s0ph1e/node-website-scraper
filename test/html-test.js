require('should');
var sinon = require('sinon');
var nock = require('nock');
var fs = require('fs-extra');
var Scraper = require('../lib/scraper');
var PageObject = require('../lib/page-object');
var loadHtml = require('../lib/file-handlers/html');

var testDirname = __dirname + '/.tmp/html';
var defaultScraperOpts = {
	urls: [ 'http://example.com' ],
	directory: testDirname,
	subdirectories: [
		{ directory: 'local', extensions: ['.jpg', '.css', '.js'] }
	],
	sources: [
		{ selector: 'img', attr: 'src' },
		{ selector: 'link[rel="stylesheet"]', attr: 'href' },
		{ selector: 'script', attr: 'src' }
	]
};
var scraper;

describe('Html handler', function () {
	describe('#loadHtml(context, pageObject)', function() {

		beforeEach(function() {
			scraper = new Scraper(defaultScraperOpts);
			return scraper.beforeLoad();
		});

		afterEach(function() {
			return fs.removeSync(testDirname);
		});

		it('should remove base tag from text and update url for absolute href', function(done) {
			var html = ' \
				<html lang="en"> \
				<head> \
				<base href="http://some-other-domain.com/src">\
				</head> \
				<body></body> \
				</html>\
			';
			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			loadHtml(scraper, po).then(function() {
				po.getUrl().should.be.eql('http://some-other-domain.com/src');
				done();
			}).catch(done);
		});

		it('should remove base tag from text and update url for relative href', function(done) {
			var html = ' \
				<html lang="en"> \
				<head> \
				<base href="/src">\
				</head> \
				<body></body> \
				</html>\
			';
			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			loadHtml(scraper, po).then(function() {
				po.getUrl().should.be.eql('http://example.com/src');
				done();
			}).catch(done);
		});

		it('should not remove base tag if it doesn\'t have href attribute', function(done) {
			var html = ' \
				<html lang="en"> \
				<head> \
				<base target="_blank">\
				</head> \
				<body></body> \
				</html>\
			';
			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			loadHtml(scraper, po).then(function() {
				po.getUrl().should.be.eql('http://example.com');
				po.getText().should.containEql('<base target="_blank">');
				done();
			}).catch(done);
		});

		it('should not call loadPageObject if no sources in html', function(done) {
			var loadPageObjectSpy = sinon.spy(scraper, 'loadPageObject');

			var po = new PageObject('http://example.com', 'index.html');
			po.setText('');

			loadHtml(scraper, po).then(function() {
				loadPageObjectSpy.called.should.be.eql(false);
				done();
			}).catch(done);
		});

		it('should not call loadPageObject if source attr is empty', function(done) {
			nock('http://example.com').get('/test.png').reply(200, 'OK');

			var loadPageObjectSpy = sinon.spy(scraper, 'loadPageObject');

			var html = ' \
				<html lang="en"> \
				<head></head> \
				<body><img src=""></body> \
				</html>\
			';

			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			loadHtml(scraper, po).then(function() {
				loadPageObjectSpy.called.should.be.eql(false);
				done();
			}).catch(done);
		});

		it('should call loadPageObject once with correct params', function(done) {
			nock('http://example.com').get('/test.png').reply(200, 'OK');

			var loadPageObjectSpy = sinon.spy(scraper, 'loadPageObject');

			var html = ' \
				<html lang="en"> \
				<head></head> \
				<body><img src="test.png"></body> \
				</html>\
			';

			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			loadHtml(scraper, po).then(function() {
				loadPageObjectSpy.calledOnce.should.be.eql(true);
				loadPageObjectSpy.args[0][0].url.should.be.eql('http://example.com/test.png');
				done();
			}).catch(done);
		});

		it('should call loadPageObject for each found source with correct params', function(done) {
			nock('http://example.com').get('/a.jpg').reply(200, 'OK');
			nock('http://example.com').get('/b.css').reply(200, 'OK');
			nock('http://example.com').get('/c.js').reply(200, 'OK');

			var loadPageObjectSpy = sinon.spy(scraper, 'loadPageObject');
			var html = '\
				<html> \
				<head> \
					<link rel="stylesheet" href="/b.css"> \
					<script src="c.js"></script>\
				</head> \
				<body> \
					<img src="a.jpg"> \
				</body> \
				</html>\
			';

			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			// order of loading is determined by order of sources in scraper options
			loadHtml(scraper, po).then(function() {
				loadPageObjectSpy.calledThrice.should.be.eql(true);
				loadPageObjectSpy.args[0][0].url.should.be.eql('http://example.com/a.jpg');
				loadPageObjectSpy.args[1][0].url.should.be.eql('http://example.com/b.css');
				loadPageObjectSpy.args[2][0].url.should.be.eql('http://example.com/c.js');
				done();
			}).catch(done);
		});

		it('should replace all sources in text with local files', function(done) {
			nock('http://other-domain.com').get('/public/img/a.jpg').reply(200, 'OK');
			nock('http://other-domain.com').get('/b.css').reply(200, 'OK');
			nock('http://example.com').get('/scripts/c.js').once().reply(200, 'OK');

			var html = '\
				<html> \
				<head> \
					<link rel="stylesheet" href="http://other-domain.com/b.css"> \
					<script src="scripts/c.js"></script>\
				</head> \
				<body> \
					<img src="http://other-domain.com/public/img/a.jpg"> \
				</body> \
				</html>\
			';

			var po = new PageObject('http://example.com', 'index.html');
			po.setText(html);

			return loadHtml(scraper, po).then(function(){
				var text = po.getText();
				text.should.not.containEql('http://other-domain.com/public/img/a.jpg');
				text.should.not.containEql('http://other-domain.com/b.css');
				text.should.not.containEql('scripts/c.js');
				text.should.containEql('local/a.jpg');
				text.should.containEql('local/b.css');
				text.should.containEql('local/c.js');
				done();
			}).catch(done);
		});
	});
});