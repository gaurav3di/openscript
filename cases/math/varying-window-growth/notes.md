# math/varying-window-growth

At the first five-length request only four contributions exist, so the
reading is absent. The following window must still include source values 1
through 5 even though earlier requests only used length 2. Discarding history
at an earlier short length delays this complete window incorrectly.
