import diagnosticsChannel from 'node:diagnostics_channel';

export const kCatboxRequestCreate = Symbol('catbox:request:create');
export const kLitterboxRequestCreate = Symbol('litterbox:request:create');

export const catboxChannels = {
	create: diagnosticsChannel.channel(kCatboxRequestCreate)
};

export const litterboxChannels = {
	create: diagnosticsChannel.channel(kLitterboxRequestCreate)
};
